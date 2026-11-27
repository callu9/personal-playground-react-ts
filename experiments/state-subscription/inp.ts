import { onINP } from 'web-vitals/attribution'

declare global {
  interface Window {
    stateInp?: { value: number; inputDelay: number; processing: number; presentation: number }
  }
}

// Same collection as the Jonbeo experiment: attribution build, every change, 16 ms threshold.
onINP(({ value, attribution }) => {
  window.stateInp = {
    value, inputDelay: attribution.inputDelay, processing: attribution.processingDuration, presentation: attribution.presentationDelay,
  }
}, { reportAllChanges: true, durationThreshold: 16 })
