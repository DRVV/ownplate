<template>
  <section class="section">
    <back-button :url="parentUrl" />
    <div>
      <div style="float:left">
        <h2>{{ orderName }}</h2>
      </div>
      <div style="float:right" v-if="!canceling">
        <b-button type="is-danger" @click="canceling=true">{{ $t("admin.order.cancelButton" )}}</b-button>
      </div>
      <div style="clear:both" />
    </div>
    <div style="margin-bottom:1rem">
      <div v-if="canceling">
        <div class="message-box">
          <div style="width:100%">
            <div style="float:right; width:2.5em;height:1px">
              <b-button style="position:abolute;border:none;top:-0.5rem" @click="canceling=false">
                <i class="fa fa-times-circle gray-icon" />
              </b-button>
            </div>
            <div style="clear:both" />
          </div>
          <h3>{{$t("admin.order.cancelTitle")}}</h3>
          <p>{{$t("admin.order.cancelMessage")}}</p>
          <p>
            <span>{{orderInfo.name }}</span>
            <a :href="nationalPhoneURI">{{ nationalPhoneNumber }}</a>
          </p>
        </div>
        <div style="margin:0.2rem">
          <b-button
            type="is-danger"
            style="width:100%"
            class="light"
            @click="handleChangeStatus('oder_canceled', $event)"
          >{{ $t("admin.order.delete") }}</b-button>
        </div>
      </div>
      <div v-else>
        <p v-if="orderInfo.phoneNumber" style="margin-bottom:1rem">
          <span>{{orderInfo.name }}</span>
          <a :href="nationalPhoneURI">{{ nationalPhoneNumber }}</a>
        </p>
      </div>
      <div v-for="orderState in orderStates" style="margin:0.2rem" :key="orderState">
        <b-button
          :class="classOf(orderState)"
          style="width:100%"
          @click="handleChangeStatus(orderState, $event)"
        >{{ $t("order.status." + orderState) }}</b-button>
      </div>
    </div>
    <ordered-item v-for="id in ids" :key="id" :item="items[id]" />
  </section>
</template>

<script>
import { db } from "~/plugins/firebase.js";
import BackButton from "~/components/BackButton";
import OrderedItem from "~/components/OrderedItem";
import { order_status } from "~/plugins/constant.js";
import { nameOfOrder } from "~/plugins/strings.js";
import { parsePhoneNumber, formatNational } from "~/plugins/phoneutil.js";

export default {
  components: {
    BackButton,
    OrderedItem
  },

  data() {
    return {
      orderStates: [
        "customer_paid",
        "order_accepted",
        "cooking_completed",
        "customer_picked_up"
      ],
      shopInfo: {},
      menuObj: {},
      orderInfo: {},
      canceling: false,
      detacher: []
    };
  },
  created() {
    const restaurant_detacher = db
      .doc(`restaurants/${this.restaurantId()}`)
      .onSnapshot(restaurant => {
        if (restaurant.exists) {
          const restaurant_data = restaurant.data();
          this.shopInfo = restaurant_data;
        }
      });
    const menu_detacher = db
      .collection(`restaurants/${this.restaurantId()}/menus`)
      .onSnapshot(menu => {
        if (!menu.empty) {
          const menuList = menu.docs.map(this.doc2data("menu"));
          this.menuObj = this.array2obj(menuList);
        }
      });
    const order_detacher = db
      .doc(`restaurants/${this.restaurantId()}/orders/${this.orderId}`)
      .onSnapshot(order => {
        if (order.exists) {
          const order_data = order.data();
          this.orderInfo = order_data;
        }
      });
    this.detacher = [restaurant_detacher, menu_detacher, order_detacher];
  },
  destroyed() {
    this.detacher.map(detacher => {
      detacher();
    });
  },
  computed: {
    phoneNumber() {
      return (
        this.orderInfo &&
        this.orderInfo.phoneNumber &&
        parsePhoneNumber(this.orderInfo.phoneNumber)
      );
    },
    nationalPhoneNumber() {
      return formatNational(this.phoneNumber);
    },
    nationalPhoneURI() {
      return "tel:" + this.phoneNumber.getNationalNumber();
    },
    orderName() {
      return nameOfOrder(this.orderInfo);
    },
    ids() {
      return this.orderInfo.order ? Object.keys(this.orderInfo.order) : [];
    },
    count() {
      return this.ids ? this.ids.length : 0;
    },
    orderId() {
      return this.$route.params.orderId;
    },
    parentUrl() {
      return `/admin/restaurants/${this.restaurantId()}/orders`;
    },
    items() {
      return Object.keys(this.orderInfo.order).reduce((ret, id) => {
        ret[id] = {
          count: this.orderInfo.order[id],
          option: this.specialRequest(id),
          menu: this.menuObj[id]
        };
        return ret;
      }, {});
    }
  },
  methods: {
    // NOTE: Exact same code in the order/_orderId/index.vue for the user.
    // This is intentional because we may want to present it differently to admins.
    specialRequest(key) {
      const option = this.orderInfo.options && this.orderInfo.options[key];
      if (option) {
        return option.filter(choice => choice).join(", ");
      }
      return "";
    },
    async handleChangeStatus(statusKey, event) {
      const ref = db.doc(
        `restaurants/${this.restaurantId()}/orders/${this.orderId}`
      );
      console.log(this.orderInfo);
      await ref.set({ status: order_status[statusKey] }, { merge: true });
      this.$router.push(this.parentUrl);
    },
    classOf(statusKey) {
      if (order_status[statusKey] == this.orderInfo.status) {
        return statusKey;
      }
      return "light";
    }
  }
};
</script>

<style lang="scss">
.light {
  background: $light;
  border: none;
}
.message-box {
  border: 1px #dddddd solid;
  border-radius: 5px;
  margin-bottom: 1rem;
  padding: 0.5rem;
  background: white;
  text-align: center;
}
.gray-icon {
  color: $grey;
}
</style>
