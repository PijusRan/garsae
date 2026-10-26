// Only the timer tick lives here. Worker timers are not throttled like
// background-tab timers, so scheduling keeps up when the tab is hidden.
let timer: ReturnType<typeof setInterval> | undefined;

self.onmessage = (e: MessageEvent<{ cmd: 'start' | 'stop'; interval?: number }>) => {
  if (e.data.cmd === 'start') {
    if (timer) clearInterval(timer);
    timer = setInterval(() => self.postMessage('tick'), e.data.interval ?? 100);
  } else if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
};
