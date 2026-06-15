<template>
  <div class="brandbar">
    <div class="brandbar__mark" />
    <div class="brandbar__name">job<span>Match</span></div>
  </div>
</template>

<style scoped>
.brandbar {
  width: var(--job-card-width);
  height: var(--brandbar-height);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: var(--match-card-control-gap);
  flex: 0 0 auto;
}

.brandbar__mark {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: linear-gradient(135deg, var(--accents-pink), var(--accents-green));
  flex: 0 0 auto;
}

.brandbar__name {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text-color);
}

.brandbar__name span {
  font-weight: 300;
  color: var(--border-color);
}
</style>
