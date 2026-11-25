import { expect, test } from '@playwright/test'

const experiments = [
  { title: 'Brand style runtime', issue: '공통값', evidence: '73개' },
  { title: 'Dashboard auto refresh', issue: '최신 상태', evidence: '분/탭' },
  { title: 'Jonbeo MSW performance', issue: '워커', evidence: '6.44초' },
] as const

for (const { title, issue, evidence } of experiments) {
  test(`${title} shows the problem and its evidence near the top`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const experiment = page.getByRole('navigation', { name: 'Playground experiments' }).getByRole('link', { name: new RegExp(title) })
    await expect(experiment).toContainText(issue)
    await expect(experiment).toContainText(evidence)
    await experiment.click()

    const summary = page.getByRole('region', { name: '실험 요약' })
    await expect(summary).toBeInViewport({ ratio: 1 })
    await expect(summary.getByRole('term')).toHaveText(['문제', '확인한 결과', '판단'])
    await expect(summary.getByRole('definition').nth(1)).toContainText(evidence)
    await page.getByRole('navigation', { name: '이 페이지에서' }).getByRole('link', { name: '검증 결과' }).click()
    await expect(page).toHaveURL(/#verification$/)
  })
}
