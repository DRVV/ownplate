import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import * as constant from '../common/constant'
import Stripe from 'stripe'
import Order from '../models/Order'

export const create = async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called while authenticated.')
  }
  const STRIPE_API_KEY = functions.config().stripe.api_key
  if (!STRIPE_API_KEY) {
    throw new functions.https.HttpsError('invalid-argument', 'The functions requires STRIPE_API_KEY.')
  }
  console.info(context)
  const uid: string = context.auth.uid
  const stripe = new Stripe(STRIPE_API_KEY, { apiVersion: '2020-03-02' })

  const orderId = data.orderId
  if (!orderId) {
    throw new functions.https.HttpsError('invalid-argument', 'This request does not include an orderId.')
  }
  const restaurantId = data.restaurantId
  if (!restaurantId) {
    throw new functions.https.HttpsError('invalid-argument', 'This request does not contain a restaurantId.')
  }
  const paymentMethodId = data.paymentMethodId
  if (!paymentMethodId) {
    throw new functions.https.HttpsError('invalid-argument', 'This request does not contain a paymentMethodId.')
  }
  const phoneNumber = data.phoneNumber
  if (!phoneNumber) {
    throw new functions.https.HttpsError('invalid-argument', 'This request does not contain a phoneNumber.')
  }

  try {
    const result = await admin.firestore().runTransaction(async transaction => {

      const orderRef = admin.firestore().doc(`restaurants/${restaurantId}/orders/${orderId}`)
      const snapshot = await transaction.get(orderRef)
      const order = Order.fromSnapshot<Order>(snapshot)

      // Check the stock status.
      if (order.status !== constant.order_status.validation_ok) {
        throw new functions.https.HttpsError('aborted', 'This order is invalid.')
      }

      // FIXME: check amount, currency.
      const amount = order.total * 100

      const request = {
        setup_future_usage: 'off_session',
        amount: amount,
        currency: 'USD',
        payment_method: paymentMethodId,
        metadata: { uid, restaurantId, orderId }
      } as Stripe.PaymentIntentCreateParams

      const paymentInset = await stripe.paymentIntents.create(request, {
        idempotencyKey: orderRef.path
      })
      transaction.set(orderRef, {
        phoneNumber: phoneNumber
      }, { merge: true })
      return {
        paymentIntentId: paymentInset.id,
        orderId: orderRef.id
      }
    })
    return { result }
  } catch (error) {
    console.error(error)
    return { error }
  }
};

export const confirm = async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called while authenticated.')
  }
  const STRIPE_API_KEY = functions.config().stripe.api_key
  if (!STRIPE_API_KEY) {
    throw new functions.https.HttpsError('invalid-argument', 'The functions requires STRIPE_API_KEY.')
  }
  console.info(context)
  const stripe = new Stripe(STRIPE_API_KEY, { apiVersion: '2020-03-02' })

  const orderPath = data.orderPath
  if (!orderPath) {
    throw new functions.https.HttpsError('invalid-argument', 'This request does not include an orderPath.')
  }
  const paymentIntentID = data.paymentIntentId
  if (!paymentIntentID) {
    throw new functions.https.HttpsError('invalid-argument', 'This request does not contain a paymentIntentID.')
  }

  try {
    const result = await admin.firestore().runTransaction(async transaction => {
      const orderRef = admin.firestore().doc(orderPath)
      const snapshot = await transaction.get(orderRef)
      const order = Order.fromSnapshot<Order>(snapshot)

      if (!snapshot.exists) {
        throw new functions.https.HttpsError('invalid-argument', `The order does not exist. ${orderRef.path}`)
      }
      // Check the stock status.
      if (order.status !== constant.order_status.validation_ok) {
        throw new functions.https.HttpsError('aborted', 'This order is invalid.')
      }

      try {
        // Check the stock status.
        const paymentInset = await stripe.paymentIntents.confirm(paymentIntentID, {
          idempotencyKey: order.id
        })
        transaction.set(orderRef, {
          timePaid: admin.firestore.FieldValue.serverTimestamp(),
          status: constant.order_status.customer_paid,
          result: paymentInset
        }, { merge: true })
        return paymentInset
      } catch (error) {
        throw error
      }
    })
    return { result }
  } catch (error) {
    console.error(error)
    return { error }
  }
};
