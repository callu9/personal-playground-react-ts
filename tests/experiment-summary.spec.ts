import { expect, test } from '@playwright/test'

const experiments = [
  { id: 'brand-theme', title: 'Brand style runtime', issue: '공통값', evidence: '73개' },
  { id: 'chart-loading', title: 'Chart loading', issue: '차트', evidence: '404' },
  { id: 'dashboard-refresh', title: 'Dashboard auto refresh', issue: '최신 상태', evidence: '분/탭' },
  { id: 'job-status', title: 'Job status polling', issue: '요청 제한', evidence: '862' },
  { id: 'jonbeo-msw', title: 'Jonbeo MSW performance', issue: '워커', evidence: '6.44초' },
  { id: 'state-subscription', title: 'State subscription and INP', issue: '통화', evidence: '192' },
] as const

for (const { id, title, issue, evidence } of experiments) {
  test(`${title} shows the problem and its evidence near the top`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('link', { name: '프로젝트 문서 목차' })).toHaveAttribute('href', /\/blob\/.+\/README\.md$/)
    const experiment = page.getByRole('navigation', { name: 'Playground experiments' }).getByRole('link', { name: new RegExp(title) })
    await expect(experiment).toContainText(issue)
    await expect(experiment).toContainText(evidence)
    await experiment.click()

    const summary = page.getByRole('region', { name: '실험 요약' })
    await expect(summary).toBeInViewport({ ratio: 1 })
    await expect(summary.getByRole('term')).toHaveText(['문제', '확인한 결과', '판단'])
    await expect(summary.getByRole('definition').nth(1)).toContainText(evidence)
    const documents = page.getByRole('navigation', { name: '실험 문서' })
    await expect(documents.getByRole('link', { name: '실험 지침' })).toHaveAttribute('href', new RegExp(`/blob/.+/docs/experiments/${id}/README\\.md$`))
    await expect(documents.getByRole('link', { name: '결과 보고서' })).toHaveAttribute('href', new RegExp(`/blob/.+/docs/experiments/${id}/results\\.md$`))
    await expect(documents.getByRole('link', { name: '측정 원본' })).toHaveAttribute('href', new RegExp(`/tree/.+/docs/experiments/${id}/evidence$`))
    await expect(documents.getByRole('link', { name: '프로젝트 공통 지침' })).toHaveAttribute('href', /\/blob\/.+\/AGENTS\.md$/)
    await page.getByRole('navigation', { name: '이 페이지에서' }).getByRole('link', { name: '검증 결과' }).click()
    await expect(page).toHaveURL(/#verification$/)
  })
}
