import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { money, niceDate } from "./format.js";


export default function ReceiptCard({ receipt, onExtract, onSendToSheets, sheetTitle }) {
  const [thumb, setThumb] = useState(null);
  const x = receipt.extracted;
  const isImage = receipt.mime_type?.startsWith("image/");

  useEffect(() => {
    let alive = true;
    if (isImage) {
      // Short-lived private link: only works for the signed-in owner, expires in 1 hour.
      supabase.storage.from("receipts").createSignedUrl(receipt.file_path, 3600)
        .then(({ data }) => alive && setThumb(data?.signedUrl ?? null));
    }
    return () => { alive = false; };
  }, [receipt.file_path, isImage]);

  return (
    <article className={`receipt receipt-${receipt.status}`}>
      <header className="receipt-top">
        {isImage && thumb
          ? <img className="receipt-thumb" src={thumb} alt="" />
          : <div className="receipt-thumb receipt-thumb-file" aria-hidden="true">{isImage ? "" : "PDF"}</div>}
        <div className="receipt-id">
          <strong>{receipt.merchant || receipt.file_name || "Receipt"}</strong>
          <span>
            {receipt.status === "extracted" && (niceDate(receipt.receipt_date) || "No date found")}
            {receipt.status === "uploaded" && "Uploaded, not read yet"}
            {receipt.status === "extracting" && "Reading receipt…"}
            {receipt.status === "failed" && "Couldn't read this one"}
          </span>
        </div>
      </header>

      {receipt.status === "extracting" && <div className="scan" aria-hidden="true" />}

      {receipt.status === "uploaded" && (
        <button className="btn btn-primary" onClick={() => onExtract([receipt.id])}>Extract information</button>
      )}

      {receipt.status === "failed" && (
        <div className="receipt-body">
          <p className="msg-error">{receipt.error || "Something went wrong."}</p>
          <button className="btn" onClick={() => onExtract([receipt.id])}>Try again</button>
        </div>
      )}

      {receipt.status === "extracted" && x && (
        <div className="receipt-body">
          {x.summary && <p className="receipt-summary">{x.summary}</p>}

          {x.fields?.length > 0 && (
            <dl className="fields">
              {x.fields.map((f, i) => (
                <div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>
              ))}
            </dl>
          )}

          {x.columns?.length > 0 && (
            <div className="table-wrap" tabIndex={0} aria-label="Line items">
              <table className="ledger">
                <thead><tr>{x.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                <tbody>
                  {(x.rows ?? []).map((row, ri) => (
                    <tr key={ri}>{x.columns.map((_, ci) => <td key={ci}>{row[ci] ?? ""}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {receipt.total != null && (
            <div className="total-line">
              <span>Total</span>
              <span className="total-amount">{money(receipt.total, receipt.currency)}</span>
            </div>
          )}

          {x.confidence === "low" && (
            <p className="msg-warn">Some parts were hard to read. Please double check the numbers.</p>
          )}
          {x.notes && <p className="receipt-notes">{x.notes}</p>}

          <div className="receipt-actions">
            {receipt.exported_at && sheetTitle
              ? <span className="saved-chip">Saved to “{sheetTitle}”</span>
              : null}
            <button className="btn btn-primary" onClick={() => onSendToSheets([receipt.id])}>
              {receipt.exported_at ? "Send again" : "Send to Google Sheets"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
