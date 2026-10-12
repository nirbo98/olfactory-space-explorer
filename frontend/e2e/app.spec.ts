import { expect, test, type Page } from '@playwright/test'

const SHOTS = 'e2e/screenshots'

async function open(page: Page) {
  const simulateCalls: string[] = []
  page.on('request', (r) => { if (r.url().endsWith('/api/v1/simulate')) simulateCalls.push(r.postData() ?? '') })
  await page.goto('/')
  await expect(page.getByTestId('odor-space').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('coord-x')).not.toHaveText('—')
  await page.waitForTimeout(800)
  return simulateCalls
}

const num = async (page: Page, id: string) => Number((await page.getByTestId(id).innerText()).replace(/[^\d.\-e]/g, ''))

test('3-D canvas renders a populated odor space', async ({ page }) => {
  await open(page)
  const lit = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="odor-space"] canvas') as HTMLCanvasElement
    const off = document.createElement('canvas')
    off.width = c.width; off.height = c.height
    const ctx = off.getContext('2d')!
    ctx.drawImage(c, 0, 0)
    const d = ctx.getImageData(0, 0, off.width, off.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 120) n++
    return n
  })
  expect(lit).toBeGreaterThan(500)
  await expect(page.getByTestId('provenance-badge')).toContainText('נתונים מדומים — לא אומתו בניסוי')
  await expect(page.getByTestId('axis-label-x')).toContainText('PC1')
  await page.screenshot({ path: `${SHOTS}/01-explore-pca.png` })
})

test('Scenario 1: dimension sliders change only the projection', async ({ page }) => {
  const calls = await open(page)
  await page.getByTestId('mode-direct').click()
  await expect(page.getByTestId('axis-label-x')).toContainText('z[0]')
  const before = await Promise.all(['coord-x', 'coord-y', 'coord-z'].map((id) => num(page, id)))
  const nCalls = calls.length
  await page.getByTestId('dim-x').fill('17')
  await expect(page.getByTestId('dim-x-value')).toHaveText('z[17]')
  await expect(page.getByTestId('axis-label-x')).toContainText('z[17]')
  await expect(page.getByTestId('axis-label-y')).toContainText('z[1]')
  await expect(page.getByTestId('axis-label-z')).toContainText('z[2]')
  const after = await Promise.all(['coord-x', 'coord-y', 'coord-z'].map((id) => num(page, id)))
  expect(after[0]).not.toBeCloseTo(before[0], 3)
  expect(after[1]).toBeCloseTo(before[1], 6)
  expect(after[2]).toBeCloseTo(before[2], 6)
  await page.waitForTimeout(500)
  expect(calls.length).toBe(nCalls) // projection-only: no model recomputation
  await page.screenshot({ path: `${SHOTS}/02-direct-dim17.png` })
})

test('Scenario 2: concentration change recomputes the model and moves the marker', async ({ page }) => {
  const calls = await open(page)
  await page.getByTestId('tab-simulate').click()
  const x0 = await Promise.all(['coord-x', 'coord-y', 'coord-z'].map((id) => num(page, id)))
  const r0 = await page.getByTestId('selected-receptor-value').innerText()
  const n = calls.length
  const resp = page.waitForResponse((r) => r.url().endsWith('/api/v1/simulate') && r.status() === 200)
  await page.getByTestId('conc-C001').fill('1.6')
  await resp
  await expect.poll(async () => (await Promise.all(['coord-x', 'coord-y', 'coord-z'].map((id) => num(page, id)))).join()).not.toBe(x0.join())
  expect(calls.length).toBeGreaterThan(n)
  expect(JSON.parse(calls.at(-1)!).mixture[0]).toEqual({ compound_id: 'C001', concentration: 1.6 })
  await page.getByTestId('receptor-select').selectOption('R020')
  expect(await page.getByTestId('selected-receptor-value').innerText()).not.toBe(r0)
  await page.screenshot({ path: `${SHOTS}/03-simulate-concentration.png` })
})

test('Scenario 3: receptor R003 knockout propagates downstream', async ({ page }) => {
  const calls = await open(page)
  await page.getByTestId('tab-simulate').click()
  // use a mixture that strongly drives R003 so the effect is visible
  await page.getByTestId('receptor-select').selectOption('R003')
  const resp = page.waitForResponse((r) => r.url().endsWith('/api/v1/simulate'))
  await page.getByTestId('receptor-knockout').click()
  await resp
  await expect(page.getByTestId('selected-receptor-value')).toHaveText('0.0000')
  expect(JSON.parse(calls.at(-1)!).receptor_knockdowns).toEqual({ R003: 1 })
  await expect.poll(() => num(page, 'baseline-shift')).toBeGreaterThan(0)
  await page.getByTestId('receptor-diff').click()
  await page.screenshot({ path: `${SHOTS}/04-knockout-R003.png` })
})

test('Scenario 4: temporal playback, pause and reset', async ({ page }) => {
  await open(page)
  await page.getByTestId('scenario').selectOption('sniff_4hz')
  await page.waitForResponse((r) => r.url().endsWith('/api/v1/simulate'))
  await page.getByTestId('play').click()
  await page.waitForTimeout(1200)
  await page.getByTestId('pause').click()
  const t1 = await page.getByTestId('time-value').innerText()
  expect(t1).not.toContain('t = 0.000')
  await page.waitForTimeout(600)
  expect(await page.getByTestId('time-value').innerText()).toBe(t1)
  await page.screenshot({ path: `${SHOTS}/05-temporal-trajectory.png` })
  await page.getByTestId('analysis-fft').click()
  await expect(page.getByTestId('fft-dominant')).toContainText('Hz')
  await page.screenshot({ path: `${SHOTS}/06-fft.png` })
  await page.getByTestId('reset-time').click()
  await expect(page.getByTestId('time-value')).toContainText('t = 0.000')
})

test('Scenario 5: Taylor analysis on two components', async ({ page }) => {
  await open(page)
  await page.getByTestId('tab-simulate').click()
  await page.getByTestId('receptor-select').selectOption('R020')
  const resp = page.waitForResponse((r) => r.url().endsWith('/api/v1/analyze/taylor'))
  await page.getByTestId('analysis-taylor').click()
  expect((await resp).status()).toBe(200)
  await expect(page.getByTestId('taylor-panel')).toContainText('Hessian')
  await page.screenshot({ path: `${SHOTS}/07-taylor.png` })
})

test('Scenario 6: inverse design returns bounded candidates', async ({ page }) => {
  await open(page)
  await page.getByTestId('tab-inverse').click()
  await expect(page.getByTestId('inverse-target')).toContainText('M0001')
  const resp = page.waitForResponse((r) => r.url().endsWith('/api/v1/inverse-design'), { timeout: 60_000 })
  await page.getByTestId('inverse-run').click()
  expect((await resp).status()).toBe(200)
  await expect(page.getByTestId('inverse-candidates')).toContainText('#1')
  await page.screenshot({ path: `${SHOTS}/08-inverse.png` })
  await page.getByTestId('analysis-metrics').click()
  await expect(page.getByTestId('metrics-panel')).toContainText('R²')
  await page.screenshot({ path: `${SHOTS}/09-metrics.png` })
})

test('Inverse target dragging lifts a 3-D displacement into the latent target', async ({ page }) => {
  await open(page)
  await page.getByTestId('tab-inverse').click()
  await expect(page.getByTestId('inverse-target')).toContainText('M0001')
  await page.waitForTimeout(1500)
  // screen position of the gizmo's X handle, computed by the scene from the camera
  const h = await page.evaluate(() => (window as unknown as { __OSE__: { sceneShared: { inverseHandles: { center: number[]; xHandle: number[] } | null } } }).__OSE__.sceneShared.inverseHandles)
  expect(h).not.toBeNull()
  const box = (await page.getByTestId('odor-space').boundingBox())!
  const [x, y] = [box.x + h!.xHandle[0], box.y + h!.xHandle[1]]
  const [dx, dy] = [h!.xHandle[0] - h!.center[0], h!.xHandle[1] - h!.center[1]]
  const n = Math.hypot(dx, dy)
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (dx / n) * i * 8, y + (dy / n) * i * 8, { steps: 2 })
  await page.mouse.up()
  await expect(page.getByTestId('inverse-target')).toContainText('Δp')
  const txt = await page.getByTestId('inverse-target').innerText()
  const dp = txt.match(/\(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/)!.slice(1).map(Number)
  expect(Math.abs(dp[0])).toBeGreaterThan(0.05)   // moved along X only
  expect(Math.abs(dp[1])).toBeLessThan(0.005); expect(Math.abs(dp[2])).toBeLessThan(0.005)
  await page.screenshot({ path: `${SHOTS}/10-inverse-drag.png` })
})

test('Science & Computations tab: navigation, content, and the simulation still works afterwards', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const calls = await open(page)

  // navigate to the Hebrew tab
  const tab = page.getByTestId('tab-science')
  await expect(tab).toHaveText('מדע וחישובים')
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const panel = page.getByTestId('science-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('נתוני הדמו סינתטיים')
  await expect(page.getByTestId('odor-space').locator('canvas')).toBeVisible()   // scene stays mounted

  // all eight computation notes expand and show their content
  const notes = panel.locator('details')
  await expect(notes).toHaveCount(8)
  for (let i = 0; i < 8; i++) {
    await notes.nth(i).locator('summary').click()
    await expect(notes.nth(i)).toHaveAttribute('open', '')
  }
  await expect(panel).toContainText('r_j = g_j')                                 // binding formula
  await expect(panel).toContainText('exp(−Δt/τ)')                               // exact integration
  await expect(panel).toContainText('ה-API של השרת מאפשר עד 5')                  // component limits
  await expect(panel).toContainText('עם 3 בדיוק')

  // literature links: DOI targets, opened safely in a new tab
  const links = panel.locator('a[href^="https://doi.org/10."]')
  await expect(links).toHaveCount(8)
  for (const l of await links.all()) {
    await expect(l).toHaveAttribute('target', '_blank')
    await expect(l).toHaveAttribute('rel', /noopener/)
  }
  await page.screenshot({ path: `${SHOTS}/11-science-tab.png` })

  // the existing simulation still works after visiting the tab
  await page.getByTestId('tab-simulate').click()
  await expect(panel).toBeHidden()
  const before = await Promise.all(['coord-x', 'coord-y', 'coord-z'].map((id) => num(page, id)))
  const n = calls.length
  const resp = page.waitForResponse((r) => r.url().endsWith('/api/v1/simulate') && r.status() === 200)
  await page.getByTestId('conc-C001').fill('1.4')
  await resp
  expect(calls.length).toBeGreaterThan(n)
  expect(JSON.parse(calls.at(-1)!).mixture[0]).toEqual({ compound_id: 'C001', concentration: 1.4 })
  await expect.poll(async () => (await Promise.all(['coord-x', 'coord-y', 'coord-z'].map((id) => num(page, id)))).join())
    .not.toBe(before.join())
  expect(errors).toEqual([])
})
