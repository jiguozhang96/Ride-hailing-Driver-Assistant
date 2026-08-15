<template>
  <view class="page">
    <view class="hero">
      <text class="title">今日跑单规划</text>
      <text class="sub" v-if="daily">{{ daily.totalKm }}km · 空驶率 {{ emptyRate }}%</text>
    </view>

    <view v-if="nowSeg" class="now-card">
      <text class="now-label">📍 现在推荐</text>
      <text class="now-name">{{ nowSeg.zone.name }}（热力 {{ nowSeg.score }}）</text>
      <text class="now-strategy">{{ nowSeg.strategy }}</text>
    </view>

    <view class="card" v-for="(s, i) in merged" :key="i">
      <view class="row-head">
        <text class="time">{{ s.time }}</text>
        <text class="badge">{{ s.label }}</text>
      </view>
      <text class="name">{{ s.zone.name }}</text>
      <text class="strategy">{{ s.strategy }}</text>
      <text class="km" v-if="s.km">本时段约行驶 {{ s.km }}km<text v-if="s.transfer"> · 空驶{{ s.transfer }}km</text></text>
    </view>
  </view>
</template>

<script>
import { mergeSegments } from '../../utils/engine/planner.js';

export default {
  data() { return { daily: null, merged: [], nowSeg: null }; },
  computed: {
    emptyRate() {
      return this.daily && this.daily.totalKm ? Math.round(this.daily.emptyKm / this.daily.totalKm * 100) : 0;
    },
  },
  onShow() {
    const g = getApp().globalData || {};
    this.daily = g.daily;
    if (!this.daily) { uni.showToast({ title: '请先生成规划', icon: 'none' }); return; }
    this.merged = mergeSegments(this.daily.segments);
    const now = new Date();
    const nowHour = now.getHours() + now.getMinutes() / 60;
    this.nowSeg = this.daily.segments.find(s => s.kind === 'work' && nowHour >= s.hour && nowHour < s.hour + 0.5)
      || this.daily.segments.find(s => s.kind === 'work' && nowHour < s.hour);
  },
};
</script>

<style>
.page { padding: 20rpx; }
.hero { padding: 20rpx 10rpx; }
.title { font-size: 40rpx; font-weight: 700; display: block; }
.sub { font-size: 26rpx; color: #888; margin-top: 8rpx; display: block; }
.now-card { background: #fff4f4; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx; }
.now-label { font-size: 26rpx; color: #c22020; font-weight: 700; display: block; }
.now-name { font-size: 32rpx; font-weight: 700; display: block; margin-top: 8rpx; }
.now-strategy { font-size: 26rpx; color: #666; display: block; margin-top: 6rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.row-head { display: flex; justify-content: space-between; align-items: center; }
.time { font-size: 24rpx; color: #888; }
.badge { font-size: 22rpx; padding: 4rpx 12rpx; border-radius: 8rpx; background: #eef4ff; color: #2b6ef3; }
.name { font-size: 32rpx; font-weight: 700; display: block; margin-top: 8rpx; }
.strategy { font-size: 26rpx; color: #555; display: block; margin-top: 6rpx; }
.km { font-size: 24rpx; color: #999; display: block; margin-top: 6rpx; }
</style>
