# reports

- `templates/<type>.md`: one template per report type (business, feature, market, build), SPEC 11.
  Its front matter lists the report's sections: an id, a title, one line saying what the section is
  about, and the node types the section needs (`needs`: type, minimum count, whether each node needs
  evidence, and how bad a shortfall is). Its body is the report's introduction (`{product}` is
  replaced by the product name).
- `run_audit` reads the `needs` to find gaps before reports are written; `render_report` reads the
  whole template to write `reports/<type>.md` (and `.docx`) in a run folder. Both read the same file,
  so the audit and the report always agree.
