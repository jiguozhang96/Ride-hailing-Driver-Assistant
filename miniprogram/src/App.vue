<script>
export default {
  onLaunch() {
    // 全局状态：司机档案（存本地）
    this.$options.globalData = {
      profile: null,
      daily: null,
    };
  },
};
</script>

<style>
page { background: #f7f9fc; }
</style>
