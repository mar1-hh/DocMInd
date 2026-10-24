import type { FullResult, Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter'
import { unlink } from 'node:fs/promises'
import { basename } from 'node:path'

// Error payloads and browser traces may include fill values or HTTP headers.
// Report only public test titles and outcomes, never raw errors or attachments.
export default class SafeReporter implements Reporter {
  private passed = 0
  private failed = 0
  private skipped = 0
  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep) {
    if (step.error && step.location) {
      console.error(`Failed step at ${basename(step.location.file)}:${step.location.line}`)
    }
  }
  async onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === 'passed') ++this.passed
    else if (result.status === 'skipped') ++this.skipped
    else ++this.failed
    // Playwright can write input values into its automatic failure-context file.
    for (const attachment of result.attachments) {
      if (attachment.name === 'error-context' && attachment.path) {
        await unlink(attachment.path).catch(() => undefined)
      }
    }
    const missingBrowser = result.errors.some((error) => error.message?.includes("Executable doesn't exist"))
    const hint = missingBrowser ? ' (required Chromium is not installed)' : ''
    console.log(`${result.status.toUpperCase()}: ${test.title}${hint}`)
  }
  onError() {
    console.error('E2E runner/setup error. Check the isolated stack health and Chromium installation; see docs/testing/auth-e2e.md.')
  }
  onEnd(result: FullResult) {
    console.log(`Authentication E2E run: ${result.status}; ${this.passed} passed, ${this.failed} failed, ${this.skipped} skipped`)
  }
}
