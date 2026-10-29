import { useRef, useState } from "react";
import { Upload, FileArchive, FileText, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { eventBulletinsImportApi } from "@/api";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveEvent } from "@/stores/activeEvent";

interface ImportEventBulletinModalProps {
  open: boolean;
  onClose: () => void;
}

type PreviewResult = {
  parser: string;
  confidence: number;
  filesScanned: number;
  extractedFiles: string[];
  eventHint?: { code?: string; name?: string; type?: string };
  points: Array<{ observedAt: string; lat: number; lon: number; windSpeedKmh?: number | null }>;
  warnings: string[];
};

const EVENT_TYPES = [
  { value: "CYCLONE", label: "Cyclone" },
  { value: "INONDATION", label: "Inondation" },
  { value: "FORTE_PLUIE", label: "Forte pluie" },
  { value: "VENT_VIOLENT", label: "Vent violent" },
  { value: "SECHERESSE", label: "Sécheresse" },
  { value: "GLISSEMENT_TERRAIN", label: "Glissement de terrain" },
  { value: "FEU_VEGETATION", label: "Feu de végétation" },
  { value: "VAGUE_DE_CHALEUR", label: "Vague de chaleur" },
  { value: "AUTRE", label: "Autre" },
];

export function ImportEventBulletinModal({ open, onClose }: ImportEventBulletinModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const setActiveEventId = useActiveEvent().setActiveEventId;
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [eventCode, setEventCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("CYCLONE");
  const [replaceTracks, setReplaceTracks] = useState(false);

  if (!open) return null;

  const reset = () => {
    setFile(null);
    setStep(1);
    setPreview(null);
    setEventCode("");
    setName("");
    setType("CYCLONE");
    setReplaceTracks(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePreview = async () => {
    if (!file) {
      toast("Sélectionne un fichier ou une archive", "error");
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (eventCode) form.append("eventCode", eventCode);
      if (name) form.append("name", name);
      if (type) form.append("type", type);
      const res = await eventBulletinsImportApi.preview(form) as any;
      const data = res?.data || res;
      setPreview(data);
      if (data?.eventHint?.code && !eventCode) setEventCode(data.eventHint.code);
      if (data?.eventHint?.name && !name) setName(data.eventHint.name);
      if (data?.eventHint?.type && !EVENT_TYPES.find((t) => t.value === data.eventHint.type)) setType(data.eventHint.type);
      setStep(2);
    } catch (err: any) {
      toast(err?.message || "Erreur lors de l'analyse du fichier", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (eventCode) form.append("eventCode", eventCode);
      if (name) form.append("name", name);
      if (type) form.append("type", type);
      form.append("createIfMissing", "true");
      form.append("replaceTracks", String(replaceTracks));
      const res = await eventBulletinsImportApi.import(form) as any;
      const data = res?.data || res;
      toast("Bulletin importé avec succès", "success");
      await qc.invalidateQueries({ queryKey: ["events"], exact: false });
      await qc.refetchQueries({ queryKey: ["events", "selector"], exact: true });
      if (data?.eventId) {
        setActiveEventId(data.eventId);
      }
      handleClose();
    } catch (err: any) {
      toast(err?.message || "Erreur lors de l'import", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/45 p-4" onMouseDown={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
        <header className="border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold text-ink">Importer un bulletin d'événement</h2>
          <p className="text-sm text-muted">Accepte .zip, .tar, .gz, .csv, .json, .geojson, .txt. Le système détecte automatiquement la trajectoire.</p>
        </header>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-auto">
          {step === 1 && (
            <>
              <div
                className="border-2 border-dashed border-line rounded-xl p-6 text-center cursor-pointer hover:bg-canvas"
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} accept=".zip,.tar,.gz,.tgz,.csv,.json,.geojson,.txt,.pdf,.shp,.shx,.dbf" />
                <div className="flex flex-col items-center gap-2">
                  {file?.name.endsWith('.zip') || file?.name.endsWith('.tar') || file?.name.endsWith('.gz') ? <FileArchive className="size-8 text-brand" /> : <FileText className="size-8 text-brand" />}
                  <p className="text-sm font-medium text-ink">{file ? file.name : "Cliquer pour sélectionner un fichier ou une archive"}</p>
                  <p className="text-xs text-muted">Taille max 50 Mo • CSV/JSON/GeoJSON/PDF/TXT/ZIP (Shapefile)/TAR/GZ</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Code événement (optionnel)" placeholder="CY-2026-XXX" value={eventCode} onChange={(e) => setEventCode(e.target.value)} />
                <Input label="Nom (optionnel)" placeholder="Cyclone ..." value={name} onChange={(e) => setName(e.target.value)} />
                <div className="sm:col-span-2">
                  <Select label="Type" value={type} onChange={(e) => setType(e.target.value)} options={EVENT_TYPES} />
                </div>
              </div>
            </>
          )}
          {step === 2 && preview && (
            <>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-900">
                <CheckCircle2 className="size-5" />
                <div className="text-sm">
                  <p className="font-medium">Détecté : {preview.parser} (confiance {preview.confidence}%)</p>
                  <p className="text-xs">{preview.points.length} point(s) de trajectoire trouvés • {preview.filesScanned} fichier(s) scanné(s)</p>
                </div>
              </div>
              {preview.warnings.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 text-amber-900">
                  <AlertTriangle className="size-5 mt-0.5" />
                  <div className="text-sm space-y-1">
                    {preview.warnings.map((w, i) => <p key={i}>{w}</p>)}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Code événement" placeholder="CY-2026-XXX" value={eventCode} onChange={(e) => setEventCode(e.target.value)} />
                <Input label="Nom" placeholder="Cyclone ..." value={name} onChange={(e) => setName(e.target.value)} />
                <div className="sm:col-span-2">
                  <Select label="Type" value={type} onChange={(e) => setType(e.target.value)} options={EVENT_TYPES} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={replaceTracks} onChange={(e) => setReplaceTracks(e.target.checked)} />
                Remplacer les points de trajectoire existants pour cet événement
              </label>
              <div className="border border-line rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-canvas text-xs font-medium text-muted">Aperçu (premiers 10 points)</div>
                <div className="divide-y divide-line max-h-48 overflow-auto">
                  {preview.points.slice(0, 10).map((p, i) => (
                    <div key={i} className="px-3 py-2 text-xs flex justify-between">
                      <span>{new Date(p.observedAt).toLocaleString("fr-FR")}</span>
                      <span>{p.lat.toFixed(2)}, {p.lon.toFixed(2)} {p.windSpeedKmh ? `• ${Math.round(p.windSpeedKmh)} km/h` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <footer className="border-t border-line px-6 py-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose}>Annuler</Button>
          {step === 1 ? (
            <Button onClick={handlePreview} disabled={!file || loading}>
              {loading ? <><Loader2 className="size-4 animate-spin" /> Analyse...</> : <><Upload className="size-4" /> Analyser</>}
            </Button>
          ) : (
            <Button onClick={handleImport} disabled={loading || (preview?.points.length || 0) === 0}>
              {loading ? <><Loader2 className="size-4 animate-spin" /> Import...</> : "Importer"}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
