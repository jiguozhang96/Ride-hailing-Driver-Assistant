<template>
  <view class="page">
    <view class="hero"><text class="title">我的</text></view>

    <view class="card">
      <view class="sec">关于 · 开源引用</view>
      <text class="hint">本工具为司机自用的行程规划（V2.0），感谢以下服务与算法：</text>
      <view class="credit" v-for="(c, i) in credits" :key="i">· {{ c }}</view>
    </view>

    <view class="card">
      <view class="sec">数据管理</view>
      <button class="btn btn-danger" @tap="clear">清空本地数据</button>
    </view>
  </view>
</template>

<script>
import { storage } from '../../utils/api.js';

export default {
  data() {
    return {
      credits: [
        '高德地图 JS API / Web服务 API',
        '和风天气 API v7',
        'Viterbi 动态规划（路径全局优化）',
        'WGS84→GCJ-02 坐标转换（公开算法）',
        '12 城市真实商圈数据（高德 POI）',
        '法定节假日数据（国务院办公厅通知）',
      ],
    };
  },
  methods: {
    clear() {
      uni.showModal({
        title: '确认', content: '清空所有本地数据？',
        success: (r) => {
          if (r.confirm) { uni.clearStorageSync(); uni.showToast({ title: '已清空', icon: 'none' }); }
        },
      });
    },
  },
};
</script>

<style>
.page { padding: 20rpx; }
.hero { padding: 20rpx 10rpx; }
.title { font-size: 40rpx; font-weight: 700; display: block; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.sec { font-size: 30rpx; font-weight: 700; margin-bottom: 12rpx; }
.hint { font-size: 24rpx; color: #888; display: block; margin-bottom: 8rpx; }
.credit { font-size: 26rpx; color: #555; line-height: 1.8; }
.btn-danger { background: #f8e9e9; color: #c22020; border-radius: 10rpx; }
</style>
