/**
 * Audio tap, running on the audio thread.
 *
 * ScriptProcessorNode did the same job but on the main thread, where it
 * competes with React, the transcript, and every other thing the page is
 * doing; under load it drops frames, and dropped frames become missing words.
 * A worklet runs on the audio rendering thread and cannot be starved that way.
 *
 * It does the minimum: average to mono, post the frames, nothing else.
 * Resampling and windowing happen on the main thread where they are testable.
 */
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channels = input.length;
    const frames = input[0].length;
    if (frames === 0) return true;

    const mono = new Float32Array(frames);
    if (channels === 1) {
      mono.set(input[0]);
    } else {
      for (let i = 0; i < frames; i += 1) {
        let sum = 0;
        for (let c = 0; c < channels; c += 1) sum += input[c][i];
        mono[i] = sum / channels;
      }
    }

    // sampleRate is a global inside a worklet; the main thread needs it to
    // resample, and it is cheaper to send than to look up.
    this.port.postMessage({ samples: mono, sampleRate }, [mono.buffer]);
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
