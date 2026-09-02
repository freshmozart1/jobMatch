<template>
    <button type="button" class="scrape-cancel">Cancel</button>
</template>

<style scoped>
.scrape-cancel {
    margin-top: 18px;
    padding: 11px 26px;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: var(--background-color);
    color: var(--text-color);
    font-family: 'Inter', sans-serif;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.12s ease;
    -webkit-tap-highlight-color: transparent;
}

.scrape-cancel:active {
    transform: scale(0.97);
}
</style>
