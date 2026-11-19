"use client";

export const PAGE_SIZES = [10, 15, 25, 50, 100];

/** "Rows per page" picker plus previous/next, for lists paged in the browser. */
export function Pager({
  total,
  page,
  size,
  onPage,
  onSize,
}: {
  total: number;
  page: number;
  size: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  return (
    <div className="pager">
      <label className="row small muted" style={{ gap: 8 }}>
        Rows
        <select className="select-sm" value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label="Rows per page">
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="row" style={{ gap: 6 }}>
        <span className="small muted" style={{ marginRight: 4 }}>
          {from}–{to} of {total}
        </span>
        <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
          ‹
        </button>
        <button type="button" className="btn btn-sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">
          ›
        </button>
      </div>
    </div>
  );
}
