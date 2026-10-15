import { expect, test, type Page } from '@playwright/test'

const SHOTS = 'e2e/screenshots'
const num = async (page: Page, id: string) => Number((await page.getByTestId(id).innerText()).replace(/[^\d.\-e]/g, ''))

async function open(page: Page) {
  const apiCalls: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/')) apiCalls.push(r.url()) })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./')
  await expect(page.getByTestId('static-badge')).toBeVisible()
  await expect(page.getByTestId('coord-x')).not.toHaveText('—')
  return { apiCalls, errors }
}

test('static build: model runs in the browser and responds to inputs', async ({ page }) => {
  const { apiCalls, errors } = await open(page)
  await page.getByTestId('tab-simulate').click()
  const before = await Promise.all(['coord-x', 'coord-y', 'coord-z'].map((id) => num(page, id)))
  await page.getByTestId('conc-C001').fill('1.6')
  await expect.poll(async () => (await Promise.all(['coord-x', 'coord-y', 'coord-z'].map((id) => num(page, id)))).join())
    .not.toBe(before.join())
  await page.getByTestId('receptor-select').selectOption('R003')
  await page.getByTestId('receptor-knockout').click()
  await expect(page.getByTestId('selected-receptor-value')).toHaveText('0.0000')
  await expect.poll(() => num(page, 'baseline-shift')).toBeGreaterThan(0)
  await page.screenshot({ path: `${SHOTS}/static-01-simulate.png` })
  expect(apiCalls).toEqual([])          // no server involved
  expect(errors).toEqual([])
})

test('static build: playback, FFT, precomputed Taylor and inverse design', async ({ page }) => {
  await open(page)
  await page.getByTestId('scenario').selectOption('sniff_4hz')
  await page.waitForTimeout(1500)
  await page.getByTestId('play').click()
  await page.waitForTimeout(1200)
  await page.getByTestId('pause').click()
  expect(await page.getByTestId('time-value').innerText()).not.toContain('t = 0.000')
  await page.getByTestId('analysis-fft').click()
  await expect(page.getByTestId('fft-dominant')).toContainText('4.00Hz')
  await page.getByTestId('analysis-taylor').click()
  await expect(page.getByTestId('taylor-panel')).toContainText('Hessian')
  await page.getByTestId('tab-inverse').click()
  await page.getByTestId('inverse-run').click()
  await expect(page.getByTestId('inverse-candidates')).toContainText('#1')
  await page.screenshot({ path: `${SHOTS}/static-02-inverse.png` })
})

test('static build: Science tab, locked 3-component inverse settings, simulation still works', async ({ page }) => {
  const { apiCalls, errors } = await open(page)
  await page.getByTestId('tab-science').click()
  const panel = page.getByTestId('science-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('details')).toHaveCount(8)
  await panel.locator('details').nth(7).locator('summary').click()
  await expect(panel).toContainText('עם 3 בדיוק')
  await expect(panel.locator('a[href^="https://doi.org/10."]')).toHaveCount(10)

  // Pages inverse controls are locked to the precomputed settings (3 components)
  await page.getByTestId('tab-inverse').click()
  await expect(page.getByTestId('inv-max')).toBeDisabled()
  await expect(page.getByTestId('inv-max-value')).toHaveText('3')

  // in-browser ONNX simulation still responds afterwards
  await page.getByTestId('tab-simulate').click()
  const before = await Promise.all(['coord-x', 'coord-y', 'coord-z'].map((id) => num(page, id)))
  await page.getByTestId('conc-C001').fill('1.4')
  await expect.poll(async () => (await Promise.all(['coord-x', 'coord-y', 'coord-z'].map((id) => num(page, id)))).join())
    .not.toBe(before.join())
  await page.screenshot({ path: `${SHOTS}/static-03-science.png` })
  expect(apiCalls).toEqual([])
  expect(errors).toEqual([])
})

test('static build: validation results are served from the exported JSON', async ({ page }) => {
  const { apiCalls, errors } = await open(page)
  await page.getByTestId('tab-validation').click()
  await expect(page.getByTestId('validation-page')).toBeVisible()
  await expect(page.getByTestId('verdict-H3')).toBeVisible()
  await expect(page.getByTestId('dotplot').locator('[data-testid^="dot-row-"]')).toHaveCount(22)
  await page.screenshot({ path: `${SHOTS}/static-04-validation.png` })
  await page.getByTestId('dotplot').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/static-05-validation-dotplot.png` })
  expect(apiCalls).toEqual([])
  expect(errors).toEqual([])
})
