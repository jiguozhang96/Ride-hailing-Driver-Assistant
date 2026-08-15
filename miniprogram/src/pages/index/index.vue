<template>
  <view class="page">
    <view class="hero">
      <text class="title">网约车跑单规划助手</text>
      <text class="sub">输入出车信息，生成日度/周度跑单路线建议</text>
    </view>

    <view class="card">
      <view class="sec">基础信息</view>
      <view class="field">
        <text class="label">城市</text>
        <picker :range="cityNames" @change="onCity">
          <view class="picker">{{ cityNames[cityIndex] }}</view>
        </picker>
      </view>
      <view class="field">
        <text class="label">车辆类型</text>
        <picker :range="['新能源', '燃油车']" @change="onVehicle">
          <view class="picker">{{ ['新能源', '燃油车'][vehicleIndex] }}</view>
        </picker>
      </view>
      <view class="field">
        <text class="label">车牌类型</text>
        <picker :range="plateNames" @change="onPlate">
          <view class="picker">{{ plateNames[plateIndex] }}</view>
        </picker>
      </view>
      <view class="field">
        <text class="label">单次续航 (km)</text>
        <input class="input" type="number" v-model="rangeKm" placeholder="如 400" />
      </view>
      <view class="field">
        <text class="label">出车时间</text>
        <picker mode="time" :value="startTime" @change="onStart">
          <view class="picker">{{ startTime }}</view>
        </picker>
      </view>
      <view class="field">
        <text class="label">收车时间</text>
        <picker mode="time" :value="endTime" @change="onEnd">
          <view class="picker">{{ endTime }}</view>
        </picker>
      </view>
      <view class="switch-row">
        <text class="label">现在出发（实时规划）</text>
        <switch :checked="nowStart" @change="onNowStart" color="#2b6ef3" />
      </view>

      <button class="btn" @tap="generate">生成跑单规划</button>
      <button class="btn btn-mini" @tap="locate">📍 实时定位</button>
    </view>
  </view>
</template>

<script>
import { CITIES, cityInfo } from '../../utils/engine/poi-db.js';
import { buildDailyPlan } from '../../utils/engine/planner.js';
import { PLATE_TYPES } from '../../utils/engine/restrictions.js';
import { storage, getLocation } from '../../utils/api.js';

export default {
  data() {
    return {
      cities: CITIES,
      cityNames: CITIES.map(c => c.name),
      cityIndex: 0,
      vehicleIndex: 0,
      plateNames: Object.values(PLATE_TYPES),
      plateIndex: 0,
      rangeKm: '400',
      startTime: '07:00',
      endTime: '22:00',
      nowStart: false,
      homeLng: null,
      homeLat: null,
    };
  },
  onLoad() {
    const p = storage.get('taxi_profile');
    if (p) {
      this.cityIndex = Math.max(0, CITIES.findIndex(c => c.key === p.city));
      this.vehicleIndex = p.vehicleType === 'oil' ? 1 : 0;
      this.plateIndex = Object.keys(PLATE_TYPES).indexOf(p.plateType);
      this.rangeKm = String(p.rangeKm || 400);
      this.startTime = p.startHour != null ? String(p.startHour).padStart(2, '0') + ':00' : '07:00';
      this.endTime = p.endHour != null ? String(p.endHour).padStart(2, '0') + ':00' : '22:00';
      this.homeLng = p.homeLng; this.homeLat = p.homeLat;
    }
  },
  methods: {
    onCity(e) { this.cityIndex = Number(e.detail.value); },
    onVehicle(e) { this.vehicleIndex = Number(e.detail.value); },
    onPlate(e) { this.plateIndex = Number(e.detail.value); },
    onStart(e) { this.startTime = e.detail.value; },
    onEnd(e) { this.endTime = e.detail.value; },
    onNowStart(e) { this.nowStart = e.detail.value; },
    async locate() {
      const loc = await getLocation();
      if (loc) { this.homeLng = loc.lng; this.homeLat = loc.lat; uni.showToast({ title: '已定位', icon: 'none' }); }
      else uni.showToast({ title: '定位失败', icon: 'none' });
    },
    generate() {
      const city = CITIES[this.cityIndex].key;
      const center = cityInfo(city).center;
      const now = new Date();
      const startHour = this.nowStart
        ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) / 2
        : parseInt(this.startTime);
      const profile = {
        city,
        vehicleType: this.vehicleIndex === 1 ? 'oil' : 'ev',
        plateType: Object.keys(PLATE_TYPES)[this.plateIndex],
        rangeKm: parseFloat(this.rangeKm) || 400,
        startHour,
        endHour: parseInt(this.endTime),
        crossCity: false, bigWeek: false,
        homeLng: this.homeLng ?? center.lng,
        homeLat: this.homeLat ?? center.lat,
      };
      storage.set('taxi_profile', profile);
      const daily = buildDailyPlan(profile, now, 'clear');
      getApp().globalData = { profile, daily };
      uni.navigateTo({ url: '/pages/daily/daily' });
    },
  },
};
</script>

<style>
.page { padding: 20rpx; }
.hero { padding: 30rpx 10rpx; }
.title { font-size: 44rpx; font-weight: 700; display: block; }
.sub { font-size: 26rpx; color: #888; margin-top: 10rpx; display: block; }
.card { background: #fff; border-radius: 20rpx; padding: 30rpx; }
.sec { font-size: 30rpx; font-weight: 700; margin-bottom: 20rpx; }
.field { margin-bottom: 20rpx; }
.label { font-size: 26rpx; color: #555; display: block; margin-bottom: 8rpx; }
.picker { padding: 16rpx; border: 1rpx solid #e5e5e5; border-radius: 10rpx; font-size: 28rpx; }
.input { padding: 16rpx; border: 1rpx solid #e5e5e5; border-radius: 10rpx; font-size: 28rpx; }
.switch-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.btn { background: #2b6ef3; color: #fff; border-radius: 10rpx; font-size: 30rpx; margin-top: 10rpx; }
.btn-mini { background: #f0f4ff; color: #2b6ef3; }
</style>
