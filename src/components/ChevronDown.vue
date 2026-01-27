<script setup>
const props = defineProps({
  size: {
    type: [Number, String],
    default: 16,
  },
})
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    role="img"
    aria-hidden="true"
    style="transition: 0.4s ease-in-out all;"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
</template>