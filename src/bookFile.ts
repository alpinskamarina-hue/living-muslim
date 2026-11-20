// Adding a book file (PDF or TXT) to the shelf in Практика → Книги. Used by the Books screen and the assistant's 📎.
// The file itself stays on this phone (IndexedDB); only its title and page count go into the state.
import type * as PdfJs from 'pdfjs-dist';
import type { BookMeta } from './types';
import { uid } from './store';
import { dayKey } from './dates';
import { putFile } from './idb';
import { _t } from './i18n';

// The PDF reader is heavy: it is downloaded only when a PDF is added or opened.
let pdfLib: Promise<typeof PdfJs> | null = null;
export function loadPdf() {
  pdfLib ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.js?worker&inline')]).then(([lib, W]) => {
    lib.GlobalWorkerOptions.workerPort = new W.default();
    return lib;
  });
  return pdfLib;
}

export const isBookFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name) || f.type.startsWith('text/') || /\.txt$/i.test(f.name);

/** Reads the file, keeps it on the phone and returns its shelf entry. Throws 'type' or 'read'. */
export async function readBook(f: File): Promise<BookMeta> {
  const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  if (!isBookFile(f)) throw new Error('type');
  const id = uid();
  let pages = 1;
  try {
    if (isPdf) {
      const pdfjs = await loadPdf();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      pages = doc.numPages;
      await doc.destroy();
    } else {
      pages = Math.max(1, Math.ceil((await f.text()).length / 1800));
    }
    await putFile(id, f);
  } catch { throw new Error('read'); }
  return { id, title: f.name.replace(/\.(pdf|txt)$/i, '') || _t("Книга"), kind: isPdf ? 'pdf' : 'txt', pages, page: 1, addedAt: dayKey(new Date()) };
}
