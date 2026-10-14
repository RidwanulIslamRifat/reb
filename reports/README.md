# reports

- `templates/<type>.md`: one template per report type, SPEC 11: business, feature, market, build,
  and (v2) due_diligence, risk, strategy, technical, rebuild.
  Its front matter lists the report's sections: an id, a title, one line saying what the section is
  about, the framework views it shows (`views`, for example `[risk_register]`, see `get_framework`),
  and the node types the section needs (`needs`: type, minimum count, whether each node needs
  evidence, and how bad a shortfall is). Node types a view already shows are not listed again one
  by one; `list: false` lists none. Its body is the report's introduction (`{product}` is replaced by
  the product name).
- `run_audit` reads the `needs` to find gaps before reports are written; `render_report` reads the
  whole template to write `reports/<type>.md` (and `.docx` / `.html`) in a run folder. Both read the
  same file, so the audit and the report always agree.
- Every report also gets, from reb itself: report details with an overall confidence rating, the
  executive summary (from the writer's draft), scope and methodology, limitations and disclaimer,
  sources and open questions.
