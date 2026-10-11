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
