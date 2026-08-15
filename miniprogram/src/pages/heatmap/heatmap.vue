<template>
  <view class="page">
    <view class="hero">
      <text class="title">商圈热力指数</text>
      <text class="sub">当前时段 · 数字为热力指数(0-10)</text>
    </view>

    <view class="card" v-for="(it, i) in rank" :key="i">
      <view class="rank-row">
        <text class="rank-no">{{ i + 1 }}</text>
        <view class="dot" :style="{ background: color(it.score) }"></view>
        <text class="name">{{ it.z.name }}</text>
        <text class="score" :style="{ color: color(it.score) }">{{ it.score.toFixed(1) }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { zonesOf } from '../../utils/engine/poi-db.js';
import { heatScore, dayKindOf } from '../../utils/engine/heat-model.js';
import { storage } from '../../utils/api.js';

export default {
  data() { return { rank: [] }; },
  onShow() {
    const profile = storage.get('taxi_profile');
    if (!profile) { uni.showToast({ title: '请先生成规划', icon: 'none' }); return; }
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const dayKind = dayKindOf(now, profile.bigWeek);
    const zones = zonesOf(profile.city).filter(z => z.type !== 'meal' && z.lng != null);
    this.rank = zones
      .map(z => ({ z, score: heatScore(z, dayKind, hour, 'clear') }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  },
  methods: {
    color(s) {
      if (s >= 8) return '#e23c3c';
      if (s >= 6.5) return '#f0781e';
      if (s >= 5) return '#f0b400';
      if (s >= 3.5) return '#4aa8e0';
      return '#9aa4b2';
    },
  },
};
</script>

<style>
.page { padding: 20rpx; }
.hero { padding: 20rpx 10rpx; }
.title { font-size: 40rpx; font-weight: 700; display: block; }
.sub { font-size: 26rpx; color: #888; margin-top: 8rpx; display: block; }
.card { background: #fff; border-radius: 16rpx; padding: 20rpx; margin-bottom: 12rpx; }
.rank-row { display: flex; align-items: center; gap: 16rpx; }
.rank-no { width: 36rpx; height: 36rpx; line-height: 36rpx; text-align: center; border-radius: 50%; background: #eee; font-size: 22rpx; color: #666; }
.dot { width: 20rpx; height: 20rpx; border-radius: 50%; }
.name { flex: 1; font-size: 28rpx; }
.score { font-size: 28rpx; font-weight: 700; }
</style>
