import type { RunnerFactory, RunnerContext, CliResponseState } from '@voiden/sdk/runner'

/**
 * simple-assertions — headless pipeline hook runner.
 *
 * Registers pre-processing (editor document capture) and post-processing
 * (assertion evaluation) hooks. No React, no DOM — pure Node.js logic.
 *
 * Hooks lazily import their implementation at invocation time to avoid
 * Node.js ESM extension-resolution issues in the lib/* chain.
 *
 * Default export: RunnerFactory — called by voiden-runner's plugin loader.
 */

const createSimpleAssertionsRunner: RunnerFactory = (context: RunnerContext) => {
  return {
    onload() {
      // Pre-processing: capture editor document into requestState.metadata
      // so the post-processing hook can read assertion blocks.
      context.pipeline.registerHook(
        'pre-processing',
        async (ctx: any) => {
          if (ctx.editor) {
            if (!ctx.requestState.metadata) ctx.requestState.metadata = {}
            ctx.requestState.metadata.editorDocument = ctx.editor.getJSON()
          }
        },
        5,
      )

      // Post-processing: evaluate assertions against the response (priority 15)
      context.pipeline.registerHook(
        'post-processing',
        async (ctx: any) => {
          const { postProcessAssertionsHook } = await import('./lib/pipelineHook.js')
          await postProcessAssertionsHook(ctx)
        },
        15,
      )

      // Post-processing: convert assertionResults → reportEntries (priority 50)
      // Runs after evaluation (15) so results are already written to metadata.
      // reportEntries is the standard channel consumed by voiden-runner CLI,
      // CSV export, and mail reports. Electron ignores reportEntries so this
      // hook is safe in both environments.
      context.pipeline.registerHook(
        'post-processing',
        async (ctx: { responseState: CliResponseState }) => {
          const assertionData = ctx.responseState?.metadata?.assertionResults
          if (!assertionData?.results?.length) return

          if (!ctx.responseState.metadata) ctx.responseState.metadata = {}
          if (!Array.isArray(ctx.responseState.metadata.reportEntries)) {
            ctx.responseState.metadata.reportEntries = []
          }

          for (const r of assertionData.results) {
            const label = r.assertion?.description?.trim()
              || `${r.assertion?.field ?? ''} ${r.assertion?.operator ?? ''} ${r.assertion?.expectedValue ?? ''}`.trim()
            ctx.responseState.metadata.reportEntries.push({
              type:     'assertion',
              message:  label || 'Assertion',
              passed:   r.passed,
              actual:   r.actualValue,
              expected: r.assertion?.expectedValue,
              operator: r.assertion?.operator,
            })
          }
        },
        50,
      )
    },
  }
}

export default createSimpleAssertionsRunner

