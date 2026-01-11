<template>
  <span :class="badgeClass">{{ label }}</span>
</template>

<script setup>
const props = defineProps({
  type: String, // "num" or "ads"
  label: String
});

const badgeClass = props.type === 'ads' ? 'serp-ads-badge' : 'serp-num-badge';
</script>

<style scoped>
.serp-num-badge,
.serp-ads-badge {
  display: inline-block;
  padding: 2px 8px;
  margin-right: 8px;
  font-weight: bold;
  border-radius: 8px;
  background: #eee;
  border: 1px solid #aaa;
  font-size: 13px;
  color: #222;
  line-height: 1.8;
}
.serp-ads-badge {
  background: #fae5b7;
  color: #91622c;
}
</style>

