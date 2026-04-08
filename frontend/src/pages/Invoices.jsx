/**
 * pages/Invoices.jsx — FY 2026-27
 *
 * Changes from previous version:
 *  ✦ Cost Centre column added to table (optional, user-filled, not compulsory)
 *  ✦ Cost Centre field added to Add Invoice dialog
 *  ✦ Cost Centre field added to Edit Invoice dialog
 *  ✦ costCentre included in create payload, edit payload, and reset
 */
import { useState, useEffect } from "react";
import {
  Box, Button, Card, Table, TableBody, TableCell, TableHead, TableRow,
  Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Chip, CircularProgress, FormControl, InputLabel, Select,
  MenuItem, IconButton, Tooltip, Alert, Autocomplete,
} from "@mui/material";
import AddIcon       from "@mui/icons-material/Add";
import UploadIcon    from "@mui/icons-material/Upload";
import EditIcon      from "@mui/icons-material/Edit";
import DeleteIcon    from "@mui/icons-material/Delete";
import DownloadIcon  from "@mui/icons-material/Download";
import FolderZipIcon from "@mui/icons-material/FolderZip";
import { api, auditLog } from "../api/client";
import { useAuth }        from "../context/AuthContext";

const FY  = "FY 2026-27";
const fmt = v => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const tkn = () => localStorage.getItem("token") || "";
const h   = () => ({ Authorization: `Bearer ${tkn()}` });
const hj  = () => ({ ...h(), "Content-Type": "application/json" });

/* ── Auto-create vendor by name ─────────────────────────────── */
async function ensureVendor(name, extras = {}) {
  if (!name?.trim()) return null;
  const r    = await fetch("/api/vendors/auto-create", { method: "POST", headers: hj(), body: JSON.stringify({ name: name.trim(), ...extras }) });
  const json = await r.json();
  return r.ok ? json : null;
}

/* ── Vendor Autocomplete (shared between Add and Edit) ───────── */
function VendorAutocomplete({ vendors, value, onChange, onNameChange }) {
  const selected = vendors.find(v => v.id === value) || null;
  return (
    <Autocomplete
      options={vendors}
      getOptionLabel={v => `${v.vendorCode ? v.vendorCode + " — " : ""}${v.name}`}
      value={selected}
      freeSolo
      onChange={(_, newVal) => {
        if (!newVal)                      { onChange("", ""); return; }
        if (typeof newVal === "string")   { onChange("", newVal); onNameChange?.(newVal); return; }
        onChange(newVal.id, newVal.name);
      }}
      onInputChange={(_, val, reason) => {
        if (reason === "input") onNameChange?.(val);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Vendor (select or type new)"
          margin="normal"
          fullWidth
          helperText={!value ? "If vendor doesn't exist, type name → will be auto-created on save" : ""}
        />
      )}
      renderOption={(props, v) => (
        <li {...props} key={v.id}>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#0EA5A0", marginRight: 8 }}>{v.vendorCode}</span>
          {v.name}
        </li>
      )}
    />
  );
}

/* ── Confirm Delete ─────────────────────────────────────────── */
function ConfirmDelete({ open, name, onConfirm, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Invoice</DialogTitle>
      <DialogContent><Typography>Delete invoice <b>#{name}</b>? Cannot be undone.</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={onConfirm}>Delete</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ── Edit Dialog ────────────────────────────────────────────── */
function EditDialog({ open, invoice, glList, budgets, vendors, onSave, onClose }) {
  const [form,      setForm]      = useState({});
  const [vendorId,  setVendorId]  = useState("");
  const [vendorRaw, setVendorRaw] = useState("");

  useEffect(() => {
    if (invoice) {
      setForm({ ...invoice });
      setVendorId(invoice.vendorId || "");
      setVendorRaw(invoice.vendorName || "");
    }
  }, [invoice]);

  const f = k => ({ value: form[k] || "", onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) });

  const handleSave = async () => {
    let vId = vendorId, vName = vendorRaw;
    if (!vId && vName.trim()) {
      const v = await ensureVendor(vName);
      if (v) { vId = v.id; vName = v.name; }
    } else if (vId) {
      vName = vendors.find(v => v.id === vId)?.name || vName;
    }
    onSave({ ...form, vendorId: vId, vendorName: vName });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Invoice — {form.invoiceNumber || form.id}</DialogTitle>
      <DialogContent>
        <FormControl fullWidth margin="normal">
          <InputLabel>Project</InputLabel>
          <Select value={form.budgetId || ""} label="Project"
            onChange={e => setForm(p => ({ ...p, budgetId: e.target.value }))}>
            {budgets.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
          </Select>
        </FormControl>
        <VendorAutocomplete
          vendors={vendors}
          value={vendorId}
          onChange={(id, name) => { setVendorId(id); setVendorRaw(name); }}
          onNameChange={setVendorRaw}
        />
        <TextField fullWidth label="Invoice Number" margin="normal" {...f("invoiceNumber")} />
        <TextField fullWidth type="number" label="Amount (₹)" margin="normal"
          value={form.amount || ""} onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) }))} />
        <TextField fullWidth type="number" label="Tax (₹)" margin="normal"
          value={form.tax || ""} onChange={e => setForm(p => ({ ...p, tax: parseFloat(e.target.value) }))} />
        <TextField fullWidth type="date" label="Date" InputLabelProps={{ shrink: true }}
          margin="normal" {...f("date")} />
        <TextField fullWidth type="date" label="Due Date" InputLabelProps={{ shrink: true }}
          margin="normal" {...f("dueDate")} />
        {/* ── Cost Centre (optional) ── */}
        <TextField fullWidth label="Cost Centre" margin="normal"
          value={form.costCentre || ""}
          onChange={e => setForm(p => ({ ...p, costCentre: e.target.value }))}
          placeholder="e.g. CC-IT-001  (optional)"
        />
        {glList.length > 0 && (
          <FormControl fullWidth margin="normal">
            <InputLabel>GL Code</InputLabel>
            <Select value={form.glCode || ""} label="GL Code"
              onChange={e => setForm(p => ({ ...p, glCode: e.target.value }))}>
              {glList.map(gl => <MenuItem key={gl.code} value={gl.code}>{gl.code} — {gl.name}</MenuItem>)}
            </Select>
          </FormControl>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>Save Changes</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function Invoices() {
  const [invoices,   setInvoices]   = useState([]);
  const [budgets,    setBudgets]    = useState([]);
  const [glList,     setGlList]     = useState([]);
  const [vendors,    setVendors]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  const [open,        setOpen]        = useState(false);
  const [uploadOpen,  setUploadOpen]  = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOpen,    setEditOpen]    = useState(false);
  const [editTarget,  setEditTarget]  = useState(null);
  const [delOpen,     setDelOpen]     = useState(false);
  const [delTarget,   setDelTarget]   = useState(null);
  const [preview,     setPreview]     = useState(null);

  // Create form state
  const [budgetId,    setBudgetId]    = useState("");
  const [vendorId,    setVendorId]    = useState("");
  const [vendorRaw,   setVendorRaw]   = useState("");
  const [invNumber,   setInvNumber]   = useState("");
  const [amount,      setAmount]      = useState("");
  const [tax,         setTax]         = useState("");
  const [date,        setDate]        = useState("");
  const [dueDate,     setDueDate]     = useState("");
  const [glCode,      setGlCode]      = useState("");
  const [costCentre,  setCostCentre]  = useState(""); // ← NEW
  const [uploading,   setUploading]   = useState(false);
  const [uploadBudId, setUploadBudId] = useState("");
  const [file,        setFile]        = useState(null);
  const [zipping,     setZipping]     = useState(false);

  const { user } = useAuth();
  const canAdd  = ["Admin","Requestor","Finance"].includes(user?.role);
  const canEdit = ["Admin","Finance"].includes(user?.role);

  /* ── load ─────────────────────────────────────────────────── */
  const load = async () => {
    try {
      const [inv, bud, gl, ven] = await Promise.all([
        fetch("/api/invoices", { headers: h() }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/budgets",  { headers: h() }).then(r => r.ok ? r.json() : []).catch(() => []),
        api.gl ? api.gl.list().catch(() => []) : Promise.resolve([]),
        fetch("/api/vendors",  { headers: h() }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setInvoices(Array.isArray(inv) ? inv : []);
      setBudgets(Array.isArray(bud) ? bud.filter(b => !b.parentProjectId) : []);
      setGlList(Array.isArray(gl)  ? gl  : []);
      setVendors(Array.isArray(ven) ? ven : []);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  /* ── resolve vendor name ─────────────────────────────────── */
  const resolveVendor = inv => {
    if (inv.vendorId) return vendors.find(v => v.id === inv.vendorId)?.name || inv.vendorName || "—";
    return inv.vendorName || "—";
  };

  /* ── create invoice ──────────────────────────────────────── */
  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      let vId = vendorId, vName = vendorRaw;
      if (!vId && vName.trim()) {
        const v = await ensureVendor(vName);
        if (v) { vId = v.id; vName = v.name; }
      } else if (vId) {
        vName = vendors.find(v => v.id === vId)?.name || vName;
      }
      if (!budgetId || !vName) { setError("Project and Vendor are required."); return; }

      const payload = {
        budgetId,
        vendorId:      vId || undefined,
        vendorName:    vName,
        invoiceNumber: invNumber || undefined,
        amount:        parseFloat(amount),
        tax:           parseFloat(tax) || 0,
        date:          date    || undefined,
        dueDate:       dueDate || undefined,
        glCode:        glCode  || undefined,
        costCentre:    costCentre.trim() || undefined,  // ← NEW
      };

      const r = await fetch("/api/invoices", { method: "POST", headers: hj(), body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }

      auditLog({ user, module: "Invoice", action: "Create", newValue: payload });
      setOpen(false);
      // Reset all fields including costCentre
      [setBudgetId, setVendorId, setVendorRaw, setInvNumber,
       setAmount, setTax, setDate, setDueDate, setGlCode, setCostCentre].forEach(s => s(""));
      load();
    } catch (e) { setError(e.message); }
  };

  /* ── upload PDF ──────────────────────────────────────────── */
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !uploadBudId) return;
    setUploading(true);
    try {
      const res  = await api.invoices.upload(file, uploadBudId);
      const prev = { ...res.preview, glCode: res.preview?.lineItems?.[0]?.glCode || "" };
      if (prev.vendorName) {
        const match = vendors.find(v => v.name.toLowerCase() === prev.vendorName.toLowerCase());
        if (match) prev.vendorId = match.id;
      }
      setPreview(prev); setPreviewOpen(true);
      setUploadOpen(false); setFile(null); setUploadBudId("");
    } finally { setUploading(false); }
  };

  const handleConfirm = async () => {
    let vId = preview.vendorId, vName = preview.vendorName;
    if (!vId && vName) {
      const v = await ensureVendor(vName, {
        gstNumber: preview.gstNumber    || "",
        address:   preview.vendorAddress || "",
        phone:     preview.vendorPhone  || "",
        email:     preview.vendorEmail  || "",
      });
      if (v) { vId = v.id; vName = v.name; }
    }
    const payload = {
      ...preview,
      vendorId: vId, vendorName: vName,
      lineItems: preview.lineItems?.length
        ? preview.lineItems
        : [{ description: "Invoice Allocation", amount: preview.amount, glCode: preview.glCode }],
    };
    await api.invoices.confirm(payload);
    auditLog({ user, module: "Invoice", action: "Create via Upload", newValue: { vendorName: vName, amount: payload.amount } });
    setPreviewOpen(false); setPreview(null); load();
  };

  /* ── edit save ───────────────────────────────────────────── */
  const handleEditSave = async (form) => {
    const r = await fetch(`/api/invoices/${editTarget.id}`, {
      method: "PATCH", headers: hj(), body: JSON.stringify({
        vendorId:      form.vendorId      || undefined,
        vendorName:    form.vendorName,
        invoiceNumber: form.invoiceNumber,
        amount:        Number(form.amount),
        tax:           Number(form.tax) || 0,
        date:          form.date,
        dueDate:       form.dueDate,
        glCode:        form.glCode,
        budgetId:      form.budgetId,
        costCentre:    form.costCentre?.trim() || undefined,  // ← NEW
      }),
    });
    if (r.ok) {
      auditLog({ user, module: "Invoice", action: "Edit", recordId: editTarget.id, oldValue: editTarget, newValue: form });
      setEditOpen(false); setEditTarget(null); load();
    }
  };

  /* ── delete ──────────────────────────────────────────────── */
  const handleDelete = async () => {
    await fetch(`/api/invoices/${delTarget.id}`, { method: "DELETE", headers: h() });
    auditLog({ user, module: "Invoice", action: "Delete", recordId: delTarget.id, oldValue: delTarget });
    setDelOpen(false); setDelTarget(null); load();
  };

  /* ── bulk download ───────────────────────────────────────── */
  const handleBulkDownload = () => {
    const withFiles = invoices.filter(i => i.fileUrl || i.pdfUrl);
    if (!withFiles.length) { alert("No invoice documents found."); return; }
    setZipping(true);
    withFiles.forEach(inv => window.open(inv.fileUrl || inv.pdfUrl, "_blank"));
    setZipping(false);
  };

  if (loading) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;

  // column count changes: +1 for Cost Centre
  const colCount = canEdit ? 11 : 10;

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5">Invoices</Typography>
          <Typography variant="caption" color="text.secondary">{FY}</Typography>
        </Box>
        {canAdd && (
          <Box display="flex" gap={1} flexWrap="wrap">
            <Button startIcon={<FolderZipIcon />} variant="outlined" onClick={handleBulkDownload} disabled={zipping}>
              {zipping ? "Opening…" : "Download All Docs"}
            </Button>
            <Button startIcon={<UploadIcon />} variant="outlined" onClick={() => setUploadOpen(true)}>Upload PDF</Button>
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => { setOpen(true); setError(""); }}>Add Invoice</Button>
          </Box>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Vendor</TableCell>
              <TableCell>Invoice #</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right">Tax</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Due</TableCell>
              <TableCell>Cost Centre</TableCell>
              <TableCell>GL</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Doc</TableCell>
              {canEdit && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  No invoices found.
                </TableCell>
              </TableRow>
            )}
            {invoices.map(i => (
              <TableRow key={i.id} hover>
                <TableCell sx={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {resolveVendor(i)}
                </TableCell>
                <TableCell>{i.invoiceNumber || "—"}</TableCell>
                <TableCell align="right">{fmt(i.amount)}</TableCell>
                <TableCell align="right">{fmt(i.tax)}</TableCell>
                <TableCell>{i.date    || "—"}</TableCell>
                <TableCell>{i.dueDate || "—"}</TableCell>
                {/* ── Cost Centre column ── */}
                <TableCell>
                  {i.costCentre
                    ? <Typography variant="caption" sx={{ fontFamily: "monospace", color: "#4338CA" }}>{i.costCentre}</Typography>
                    : <Typography variant="caption" color="text.disabled">—</Typography>}
                </TableCell>
                <TableCell>
                  {i.lineItems?.map(x => x.glCode).filter(Boolean).join(", ") || i.glCode || "—"}
                </TableCell>
                <TableCell>
                  <Chip label={i.status || "Pending"} size="small"
                    color={i.status === "Paid" ? "success" : i.status === "Partial" ? "info" : "warning"} />
                </TableCell>
                <TableCell>
                  {(i.fileUrl || i.pdfUrl)
                    ? <IconButton size="small" color="success" component="a"
                        href={i.fileUrl || i.pdfUrl} target="_blank"
                        download={`Invoice_${i.invoiceNumber || i.id}.pdf`}>
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    : <Typography variant="caption" color="text.disabled">—</Typography>}
                </TableCell>
                {canEdit && (
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => { setEditTarget(i); setEditOpen(true); }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => { setDelTarget(i); setDelOpen(true); }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* ── Add Invoice Dialog ── */}
      <Dialog open={open} onClose={() => { setOpen(false); setError(""); }} maxWidth="sm" fullWidth>
        <DialogTitle>Add Invoice — {FY}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
          <Box component="form" onSubmit={handleCreate}>
            <FormControl fullWidth margin="normal" required>
              <InputLabel>Project</InputLabel>
              <Select value={budgetId} onChange={e => setBudgetId(e.target.value)} label="Project">
                {budgets.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
              </Select>
            </FormControl>

            <VendorAutocomplete
              vendors={vendors}
              value={vendorId}
              onChange={(id, name) => { setVendorId(id); setVendorRaw(name); }}
              onNameChange={setVendorRaw}
            />

            <TextField fullWidth label="Invoice number" margin="normal"
              value={invNumber} onChange={e => setInvNumber(e.target.value)} />
            <TextField fullWidth type="number" label="Amount (₹)" margin="normal" required
              value={amount} onChange={e => setAmount(e.target.value)} />
            <TextField fullWidth type="number" label="Tax (₹)" margin="normal"
              value={tax} onChange={e => setTax(e.target.value)} />
            <TextField fullWidth type="date" InputLabelProps={{ shrink: true }} label="Date" margin="normal"
              value={date} onChange={e => setDate(e.target.value)} />
            <TextField fullWidth type="date" InputLabelProps={{ shrink: true }} label="Due date" margin="normal"
              value={dueDate} onChange={e => setDueDate(e.target.value)} />

            {/* ── Cost Centre (optional) ── */}
            <TextField fullWidth label="Cost Centre" margin="normal"
              value={costCentre} onChange={e => setCostCentre(e.target.value)}
              placeholder="e.g. CC-IT-001  (optional)"
              helperText="Optional — leave blank if not applicable"
            />

            {glList.length > 0 && (
              <FormControl fullWidth margin="normal">
                <InputLabel>GL Code</InputLabel>
                <Select value={glCode} onChange={e => setGlCode(e.target.value)} label="GL Code">
                  {glList.map(gl => <MenuItem key={gl.code} value={gl.code}>{gl.code} — {gl.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}

            <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
              <Button type="submit" variant="contained"
                disabled={!budgetId || (!vendorId && !vendorRaw) || !amount}>
                Create
              </Button>
              <Button onClick={() => { setOpen(false); setError(""); }}>Cancel</Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* ── Upload Dialog ── */}
      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Invoice PDF</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleUpload}>
            <FormControl fullWidth margin="normal" required>
              <InputLabel>Project</InputLabel>
              <Select value={uploadBudId} onChange={e => setUploadBudId(e.target.value)} label="Project">
                {budgets.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="outlined" component="label" fullWidth sx={{ mt: 2 }}>
              {file ? file.name : "Choose PDF"}
              <input type="file" accept="application/pdf" hidden onChange={e => setFile(e.target.files[0])} />
            </Button>
            <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
              <Button type="submit" variant="contained" disabled={!file || !uploadBudId || uploading}>
                {uploading ? "Uploading…" : "Upload & Parse"}
              </Button>
              <Button onClick={() => setUploadOpen(false)}>Cancel</Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* ── Preview / Confirm Dialog ── */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Review Parsed Invoice</DialogTitle>
        <DialogContent>
          {preview && (
            <>
              <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>
                {preview.vendorId ? "Vendor matched from master." : "Vendor not in master — will be auto-created on confirm."}
              </Alert>
              <TextField fullWidth label="Vendor Name"    value={preview.vendorName    || ""} margin="normal" onChange={e => setPreview({ ...preview, vendorName: e.target.value, vendorId: "" })} />
              <TextField fullWidth label="Invoice Number" value={preview.invoiceNumber || ""} margin="normal" onChange={e => setPreview({ ...preview, invoiceNumber: e.target.value })} />
              <TextField fullWidth type="number" label="Amount (₹)" value={preview.amount || 0} margin="normal" onChange={e => setPreview({ ...preview, amount: parseFloat(e.target.value) })} />
              <TextField fullWidth type="number" label="Tax (₹)"    value={preview.tax    || 0} margin="normal" onChange={e => setPreview({ ...preview, tax:    parseFloat(e.target.value) })} />
              <TextField fullWidth type="date" InputLabelProps={{ shrink: true }} label="Invoice Date" value={preview.date    || ""} margin="normal" onChange={e => setPreview({ ...preview, date:    e.target.value })} />
              <TextField fullWidth type="date" InputLabelProps={{ shrink: true }} label="Due Date"     value={preview.dueDate || ""} margin="normal" onChange={e => setPreview({ ...preview, dueDate: e.target.value })} />
              {glList.length > 0 && (
                <FormControl fullWidth margin="normal">
                  <InputLabel>GL Code</InputLabel>
                  <Select value={preview.glCode || ""} onChange={e => setPreview({ ...preview, glCode: e.target.value })} label="GL Code">
                    {glList.map(gl => <MenuItem key={gl.code} value={gl.code}>{gl.code} — {gl.name}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
              <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
                <Button variant="contained" onClick={handleConfirm}>Confirm & Save</Button>
                <Button onClick={() => setPreviewOpen(false)}>Cancel</Button>
              </Box>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <EditDialog
        open={editOpen} invoice={editTarget} glList={glList} budgets={budgets} vendors={vendors}
        onSave={handleEditSave}
        onClose={() => { setEditOpen(false); setEditTarget(null); }}
      />

      {/* ── Delete Confirm ── */}
      <ConfirmDelete
        open={delOpen} name={delTarget?.invoiceNumber || delTarget?.id || ""}
        onConfirm={handleDelete}
        onClose={() => { setDelOpen(false); setDelTarget(null); }}
      />
    </Box>
  );
}