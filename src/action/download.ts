import { IncomingMessage } from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { Observable, Subject, debounceTime, first, tap } from "rxjs";

/**
 * Observable HTTPS request that follow redirects
 */
const request = (url: string, cancel$: Subject<void>): Observable<IncomingMessage> =>
  new Observable<IncomingMessage>((subscriber) => {
    // Abortable request
    const controller = new AbortController();
    // Abort on signal
    cancel$
      .pipe(
        first(),
        tap(() => controller.abort()),
      )
      .subscribe();

    https
      .get(url, { signal: controller.signal }, (response) => {
        if (response.statusCode === 302) {
          // Follow redirect
          https
            .get(response.headers.location!, { signal: controller.signal }, (res) => {
              subscriber.next(res);
              subscriber.complete();
            })
            .on("error", (e) => subscriber.error(e))
            .end();
          return;
        }
        if (response.statusCode !== 200) {
          subscriber.error(new Error(`${response.statusCode} - ${response.statusMessage}`));
          return;
        }
        subscriber.next(response);
        subscriber.complete();
      })
      .on("error", (e) => subscriber.error(e))
      .end();
  });

const download = (url: string, dest: string, cancel$: Subject<void>) =>
  new Observable<{
    current: number;
    total?: number;
    percent: number;
  }>((subscriber) => {
    // Set initial progress to 0
    subscriber.next({
      current: 0,
      percent: 0,
    });

    // If a file already exists, skip download
    if (fs.existsSync(dest)) {
      // Set progress to 1 to show progress bar
      subscriber.next({
        current: 0,
        total: 1,
        percent: 1,
      });
      // Complete the observable
      subscriber.complete();
      return;
    }

    // Create parent directory if it doesn't exist
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // File stream for partially downloaded file
    const fileStream = fs.createWriteStream(dest + ".partial");
    // Cleanup on cancel
    const sub = cancel$
      .pipe(
        first(),
        // Wait for 100ms before closing file stream
        debounceTime(100),
        tap(() => fileStream.close()),
        // Wait for 200ms before deleting incomplete file
        debounceTime(200),
        tap(() => fs.unlink(dest, () => void 0)),
      )
      .subscribe();

    request(url, cancel$).subscribe({
      next: (response) => {
        const totalLength = parseInt(response.headers["content-length"]!, 10);
        let downloaded = 0;
        response.on("data", (chunk) => {
          downloaded += chunk.length;
          subscriber.next({
            current: downloaded,
            total: totalLength,
            percent: downloaded / totalLength,
          });
        });
        response.on("close", () => {
          fileStream.close();
          // Move the partial file to the destination
          fs.renameSync(dest + ".partial", dest);
          subscriber.complete();
        });
        // Pipe downloaded content to file stream
        response.pipe(fileStream);
      },
      error: (e) => {
        // On error, close file stream and delete incomplete file
        fileStream.close();
        fs.unlink(dest, () => void 0);
        subscriber.error(e);
      },
      complete: () => sub.unsubscribe(),
    });
  });

export { download };
