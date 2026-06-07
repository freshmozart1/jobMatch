import { test, expect } from '@playwright/test'

test('keeps the card and like controls visible on mobile portrait', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.locator('.job-card-stack__current .job-card')).toBeVisible()
  await expect(page.locator('.like-container')).toBeVisible()

  const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
  expect(bodyWidth).toBeLessThanOrEqual(390)

  const likeContainerBox = await page.locator('.like-container').boundingBox()
  expect(likeContainerBox).not.toBeNull()
  expect(likeContainerBox!.y + likeContainerBox!.height).toBeLessThanOrEqual(844)
  await expect(page.locator('.like-container')).toHaveCSS('position', 'sticky')
})

test('keeps sticky like controls visible while swiping on compact portrait', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/')

  const card = page.locator('.job-card-stack__current .job-card')
  const likeContainer = page.locator('.like-container')
  await expect(card).toBeVisible()
  await expect(likeContainer).toBeVisible()

  const cardBox = await card.boundingBox()
  expect(cardBox).not.toBeNull()
  await page.mouse.move(cardBox!.x + cardBox!.width / 2, cardBox!.y + cardBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(cardBox!.x + cardBox!.width / 2 + 180, cardBox!.y + cardBox!.height / 2)
  await expect(likeContainer).toBeVisible()
  await page.mouse.up()
  await expect(likeContainer).toBeVisible()
})
