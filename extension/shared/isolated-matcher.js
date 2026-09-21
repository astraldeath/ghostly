// Regex runs off the UI/background thread and has a hard time budget.
export function isolatedMatcher(settings) {
  let worker;
  let first = true;
  let pendingReject;
  let timer;
  return {
    explain(url) {
      if (pendingReject) return Promise.reject(new Error("Matcher is busy."));
      worker ||= new Worker(new URL("./matcher-worker.js", import.meta.url), {
        type: "module",
      });
      return new Promise((resolve, reject) => {
        pendingReject = reject;
        const finish = (error, result) => {
          clearTimeout(timer);
          pendingReject = null;
          error ? reject(error) : resolve(result);
        };
        const timeout = (initializing) => {
          clearTimeout(timer);
          timer = setTimeout(
            () => {
              worker.terminate();
              worker = null;
              first = true;
              finish(
                new Error(
                  initializing
                    ? "List indexing took too long. Use a smaller list."
                    : "A regex took too long. Simplify your advanced rules.",
                ),
              );
            },
            initializing ? 30000 : 1500,
          );
        };
        timeout(first);
        worker.onmessage = ({ data }) => {
          if (data.ready) {
            timeout(false);
            worker.postMessage({ url });
          } else finish(data.error ? new Error(data.error) : null, data.result);
        };
        worker.onerror = () => {
          worker.terminate();
          worker = null;
          first = true;
          finish(new Error("Rule evaluation failed."));
        };
        worker.postMessage(
          first
            ? {
                settings: {
                  lists: settings.lists.filter((list) => list.enabled),
                  exclusions: settings.exclusions,
                },
              }
            : { url },
        );
        first = false;
      });
    },
    dispose() {
      clearTimeout(timer);
      worker?.terminate();
      worker = null;
      first = true;
      pendingReject?.(new Error("Rule evaluation cancelled."));
      pendingReject = null;
    },
  };
}
