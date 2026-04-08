/**
 * pages/Payments.jsx — FY 2026-27
 *
 * Vendor Integration (requirements 8 & 9):
 *  ① Vendor name auto-populated: payment → invoiceId → vendorId → Vendor Master
 *  ② Users NEVER type vendor name — it always comes from the linked invoice/master
 *  ③ Vendor ID (VEN00001) shown in payments table for traceability
 *  ④ Vendor lookup chain: payment.vendorName (denorm) → vendorsMap[invoice.vendorId] → invoice.vendorName
 *  ⑤ All existing features preserved: receipt upload, edit, delete, audit
 */
import { useState, useEffect } from "react";
import {
  Box, Button, Card, Table, TableBody, TableCell, TableHead, TableRow,
  Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Chip, CircularProgress, FormControl, InputLabel, Select,
  MenuItem, IconButton, Tooltip, Alert,
} from "@mui/material";
import AddIcon      from "@mui/icons-material/Add";
import EditIcon     from "@mui/icons-material/Edit";
import DeleteIcon   from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import UploadIcon   from "@mui/icons-material/Upload";
import { auditLog } from "../api/client";
import { useAuth }   from "../context/AuthContext";

const FY  = "FY 2026-27";
const fmt = v => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const tkn = () => localStorage.getItem("token") || "";
const h   = () => ({ Authorization: `Bearer ${tkn()}` });
const hj  = () => ({ ...h(), "Content-Type": "application/json" });

/* ── Resolve vendor name from lookup chain ───────────────────── */
function getVendorName(payment, invoice, vendorsMap) {
  // 1. Denormalised on payment at create time (fastest)
  if (payment.vendorName) return payment.vendorName;
  // 2. Look up via invoice vendorId in master
  if (invoice?.vendorId && vendorsMap[invoice.vendorId]) return vendorsMap[invoice.vendorId].name;
  // 3. Fallback to invoice vendorName
  return invoice?.vendorName || "—";
}

function getVendorCode(invoice, vendorsMap) {
  if (!invoice?.vendorId) return "";
  return vendorsMap[invoice.vendorId]?.vendorCode || "";
}

/* ── Confirm Delete ─────────────────────────────────────────── */
function ConfirmDelete({ open, onConfirm, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Payment</DialogTitle>
      <DialogContent>
        <Typography>Delete this payment? Invoice and budget totals will be reversed.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={onConfirm}>Delete</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ── Edit Payment Dialog ────────────────────────────────────── */
function EditDialog({ open, payment, onSave, onClose }) {
  const [amount, setAmount] = useState("");
  const [note,   setNote]   = useState("");
  useEffect(() => {
    if (payment) { setAmount(payment.amount || ""); setNote(payment.note || ""); }
  }, [payment]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit Payment</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth label="Amount (₹)" type="number"
          value={amount} onChange={e => setAmount(e.target.value)}
          margin="normal"
        />
        <TextField
          fullWidth label="Note / Reference / Transaction ID"
          value={note} onChange={e => setNote(e.target.value)}
          margin="normal"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onSave({ amount: parseFloat(amount), note })}>
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function Payments() {
  const [payments,   setPayments]   = useState([]);
  const [invoices,   setInvoices]   = useState([]);
  const [vendorsMap, setVendorsMap] = useState({});   // id → vendor object
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  // Record Payment dialog
  const [open,       setOpen]       = useState(false);
  const [selInv,     setSelInv]     = useState("");
  const [amount,     setAmount]     = useState("");
  const [note,       setNote]       = useState("");
  const [receipt,    setReceipt]    = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit / Delete
  const [editOpen,   setEditOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [delOpen,    setDelOpen]    = useState(false);
  const [delTarget,  setDelTarget]  = useState(null);

  const { user } = useAuth();
  const canEdit  = ["Admin", "Finance"].includes(user?.role);
  const canAdd   = ["Admin", "Finance"].includes(user?.role);

  /* ── Load all in parallel ────────────────────────────────── */
  const load = async () => {
    try {
      const [pay, inv, ven] = await Promise.all([
        fetch("/api/payments", { headers: h() }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/invoices", { headers: h() }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/vendors",  { headers: h() }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setPayments(Array.isArray(pay) ? pay : []);
      setInvoices(Array.isArray(inv) ? inv : []);
      const map = {};
      (Array.isArray(ven) ? ven : []).forEach(v => { map[v.id] = v; });
      setVendorsMap(map);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  /* ── Derived ─────────────────────────────────────────────── */
  const invMap = {};
  invoices.forEach(i => { invMap[i.id] = i; });

  const enriched = payments.map(p => {
    const inv = invMap[p.invoiceId];
    return {
      ...p,
      vendorName:    getVendorName(p, inv, vendorsMap),
      vendorCode:    getVendorCode(inv, vendorsMap),
      invoiceNumber: p.invoiceNumber || inv?.invoiceNumber || inv?.id || "—",
    };
  });

  const pendingInvoices = invoices.filter(i => i.status === "Pending" || i.status === "Partial");
  const selectedInvoice = invMap[selInv];
  const selVendorName   = selectedInvoice
    ? (selectedInvoice.vendorId ? (vendorsMap[selectedInvoice.vendorId]?.name || selectedInvoice.vendorName) : selectedInvoice.vendorName) || "—"
    : "—";
  const selVendorCode   = selectedInvoice?.vendorId ? (vendorsMap[selectedInvoice.vendorId]?.vendorCode || "") : "";
  const invTotal    = selectedInvoice ? Number(selectedInvoice.amount || 0) + Number(selectedInvoice.tax || 0) : 0;
  const alreadyPaid = selectedInvoice ? Number(selectedInvoice.paidAmount || 0) : 0;
  const maxPayable  = Math.max(0, invTotal - alreadyPaid);

  /* ── Record Payment ──────────────────────────────────────── */
  const handleRecord = async () => {
    if (!selInv || !amount) return;
    setSubmitting(true); setError("");
    try {
      const r = await fetch("/api/payments", {
        method: "POST", headers: hj(),
        body: JSON.stringify({ invoiceId: selInv, amount: parseFloat(amount), note }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      const payment = await r.json();

      if (receipt && payment.id) {
        const fd = new FormData();
        fd.append("file", receipt);
        fd.append("paymentId", payment.id);
        await fetch("/api/payments/upload-receipt", { method: "POST", headers: h(), body: fd })
          .catch(e => console.warn("Receipt upload failed:", e));
      }

      auditLog({ user, module: "Payment", action: "Create", recordId: payment.id,
        newValue: { amount: parseFloat(amount), invoiceId: selInv, vendorName: payment.vendorName } });

      setOpen(false); setSelInv(""); setAmount(""); setNote(""); setReceipt(null);
      load();
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  /* ── Edit ────────────────────────────────────────────────── */
  const handleEditSave = async ({ amount: amt, note: n }) => {
    try {
      const r = await fetch(`/api/payments/${editTarget.id}`, {
        method: "PATCH", headers: hj(),
        body: JSON.stringify({ amount: amt, note: n }),
      });
      if (!r.ok) throw new Error("Update failed");
      auditLog({ user, module: "Payment", action: "Edit", recordId: editTarget.id, oldValue: editTarget, newValue: { amount: amt, note: n } });
      setEditOpen(false); setEditTarget(null); load();
    } catch (e) { setError(e.message); }
  };

  /* ── Delete ──────────────────────────────────────────────── */
  const handleDelete = async () => {
    try {
      await fetch(`/api/payments/${delTarget.id}`, { method: "DELETE", headers: h() });
      auditLog({ user, module: "Payment", action: "Delete", recordId: delTarget.id, oldValue: delTarget });
      setDelOpen(false); setDelTarget(null); load();
    } catch (e) { setError(e.message); }
  };

  if (loading) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5">Payments</Typography>
          <Typography variant="caption" color="text.secondary">{FY}</Typography>
        </Box>
        {canAdd && (
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => { setOpen(true); setError(""); }}>
            Record Payment
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Invoice #</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell>Vendor ID</TableCell>
              <TableCell align="right">Paid</TableCell>
              <TableCell>Note</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Receipt</TableCell>
              {canEdit && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {enriched.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 8 : 7} align="center" sx={{ color: "text.secondary", py: 4 }}>
                  No payments recorded yet.
                </TableCell>
              </TableRow>
            )}
            {enriched.map(p => (
              <TableRow key={p.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                    {p.invoiceNumber}
                  </Typography>
                </TableCell>
                <TableCell sx={{ fontWeight: 500, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.vendorName}
                </TableCell>
                <TableCell>
                  {p.vendorCode
                    ? <Chip label={p.vendorCode} size="small" sx={{ fontFamily: "monospace", fontSize: 10, bgcolor: "#F0FDFA", color: "#0EA5A0", border: "1px solid #99F6E4" }}/>
                    : <Typography variant="caption" color="text.disabled">—</Typography>}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(p.amount)}</TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: 12 }}>{p.note || "—"}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>
                  {p.createdAt
                    ? new Date(p.createdAt._seconds ? p.createdAt._seconds * 1000 : p.createdAt)
                        .toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })
                    : "—"}
                </TableCell>
                <TableCell>
                  {(p.receiptFileUrl || p.receiptUrl) ? (
                    <Tooltip title={`Download ${p.receiptFileName || "receipt"}`}>
                      <IconButton size="small" color="success" component="a"
                        href={p.receiptFileUrl || p.receiptUrl} target="_blank" rel="noopener noreferrer"
                        download={p.receiptFileName || "receipt"}>
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Typography variant="caption" color="text.disabled">—</Typography>
                  )}
                </TableCell>
                {canEdit && (
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => { setEditTarget(p); setEditOpen(true); }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => { setDelTarget(p); setDelOpen(true); }}>
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

      {/* ── Record Payment Dialog ── */}
      <Dialog open={open} onClose={() => { setOpen(false); setError(""); }} maxWidth="sm" fullWidth>
        <DialogTitle>Record Payment — {FY}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <FormControl fullWidth margin="normal" required>
            <InputLabel>Select Invoice</InputLabel>
            <Select value={selInv} label="Select Invoice"
              onChange={e => { setSelInv(e.target.value); setAmount(""); }}>
              {pendingInvoices.length === 0 && <MenuItem disabled>No pending invoices</MenuItem>}
              {pendingInvoices.map(i => {
                const vName = i.vendorId ? (vendorsMap[i.vendorId]?.name || i.vendorName) : i.vendorName;
                const total = Number(i.amount || 0) + Number(i.tax || 0);
                const due   = total - Number(i.paidAmount || 0);
                return (
                  <MenuItem key={i.id} value={i.id}>
                    {i.invoiceNumber || i.id} — {vName || "Unknown"} — Due: {fmt(due)}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>

          {/* Vendor info — read-only, auto-populated from master */}
          {selectedInvoice && (
            <Box sx={{ bgcolor: "#F8FAFF", border: "1px solid #E8ECF4", borderRadius: 2, p: 1.5, mt: 1, mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block", mb: 1 }}>
                Vendor (auto-populated from master — not editable)
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                <TextField label="Vendor Name" value={selVendorName}
                  InputProps={{ readOnly: true }} size="small"
                  sx={{ "& .MuiInputBase-input": { color: "text.primary", fontWeight: 500 } }} />
                <TextField label="Vendor ID" value={selVendorCode || (selectedInvoice.vendorId ? "VEN" : "—")}
                  InputProps={{ readOnly: true }} size="small"
                  sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", color: "#0EA5A0" } }} />
                <TextField label="Invoice Total"  value={fmt(invTotal)}    InputProps={{ readOnly: true }} size="small" sx={{ "& .MuiInputBase-input": { color: "text.secondary" } }} />
                <TextField label="Already Paid"   value={fmt(alreadyPaid)} InputProps={{ readOnly: true }} size="small" sx={{ "& .MuiInputBase-input": { color: "text.secondary" } }} />
              </Box>
              <TextField fullWidth label="Max Payable" value={fmt(maxPayable)}
                InputProps={{ readOnly: true }} size="small" sx={{ mt: 1, "& .MuiInputBase-input": { color: "success.main", fontWeight: 700 } }} />
            </Box>
          )}

          <TextField
            fullWidth label="Payment Amount (₹)" type="number" margin="normal" required
            value={amount} onChange={e => setAmount(e.target.value)}
            helperText={maxPayable > 0 ? `Max payable: ${fmt(maxPayable)}` : "Select an invoice first"}
            inputProps={{ max: maxPayable, min: 0.01, step: 0.01 }}
          />
          <TextField
            fullWidth label="Note / Reference / Transaction ID" margin="normal"
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. NEFT/UTR123456, cheque no."
          />

          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 600 }}>
              Upload Receipt / Payment Proof (PDF, JPG, PNG — optional)
            </Typography>
            <Button variant="outlined" component="label" size="small" startIcon={<UploadIcon />}>
              {receipt ? receipt.name : "Choose File"}
              <input type="file" accept="application/pdf,image/jpeg,image/png" hidden
                onChange={e => setReceipt(e.target.files[0] || null)} />
            </Button>
            {receipt && <Button size="small" sx={{ ml: 1 }} color="error" onClick={() => setReceipt(null)}>Remove</Button>}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpen(false); setError(""); setSelInv(""); setAmount(""); setNote(""); setReceipt(null); }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleRecord}
            disabled={!selInv || !amount || submitting || parseFloat(amount) > maxPayable || parseFloat(amount) <= 0}>
            {submitting ? "Recording…" : "Record Payment"}
          </Button>
        </DialogActions>
      </Dialog>

      <EditDialog open={editOpen} payment={editTarget} onSave={handleEditSave}
        onClose={() => { setEditOpen(false); setEditTarget(null); }} />
      <ConfirmDelete open={delOpen} onConfirm={handleDelete}
        onClose={() => { setDelOpen(false); setDelTarget(null); }} />
    </Box>
  );
}