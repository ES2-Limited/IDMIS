import * as React from 'react';
import { UploadCloud, CheckCircle2, ArrowRight } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Badge,
} from '@idmis/ui';

export interface UploadedMapLayer {
  id: string;
  name: string;
  layerType: 'catchment' | 'canal_network' | 'flood_zone' | 'drainage' | 'soil_suitability';
  basinName: string;
  format: 'geojson' | 'shapefile';
  fileName: string;
  featureCount: number;
  areaKm2: number;
  uploadedAt: string;
  uploadedBy: string;
  previewFeatures: Array<{
    name: string;
    type: string;
    coordinatesSummary: string;
  }>;
}

export const MOCK_UPLOADED_LAYERS: UploadedMapLayer[] = [
  {
    id: 'layer-up-1',
    name: 'Kano River Main Canal Network (Alignment & Siphons)',
    layerType: 'canal_network',
    basinName: "Hadejia-Jama'are River Basin",
    format: 'geojson',
    fileName: 'kris_main_canal_branches.geojson',
    featureCount: 48,
    areaKm2: 120.5,
    uploadedAt: '2026-10-18 14:30',
    uploadedBy: 'GIS Unit (HJRBDA)',
    previewFeatures: [
      {
        name: 'East Main Branch Canal',
        type: 'LineString',
        coordinatesSummary: '11.64°N, 8.52°E (18.4 km)',
      },
      {
        name: 'West Main Branch Canal',
        type: 'LineString',
        coordinatesSummary: '11.69°N, 8.48°E (22.1 km)',
      },
      {
        name: 'Sector 4 Siphon Cross-Drain',
        type: 'Point',
        coordinatesSummary: '11.672°N, 8.501°E',
      },
    ],
  },
  {
    id: 'layer-up-2',
    name: 'Hadejia-Nguru Wetlands 2026 Flood Recession Extent',
    layerType: 'flood_zone',
    basinName: "Hadejia-Jama'are River Basin",
    format: 'shapefile',
    fileName: 'wetlands_flood_zone_2026.zip',
    featureCount: 12,
    areaKm2: 340.0,
    uploadedAt: '2026-09-04 11:15',
    uploadedBy: 'Hydrology Division',
    previewFeatures: [
      {
        name: 'Nguru Lake Wetland Zone A',
        type: 'Polygon',
        coordinatesSummary: '12.82°N, 10.45°E (142 km²)',
      },
      {
        name: 'Marma Channel Inundation Zone',
        type: 'Polygon',
        coordinatesSummary: '12.65°N, 10.22°E (198 km²)',
      },
    ],
  },
  {
    id: 'layer-up-3',
    name: 'Bakolori Scheme Irrigable Soils Suitability Classification',
    layerType: 'soil_suitability',
    basinName: 'Sokoto-Rima River Basin',
    format: 'geojson',
    fileName: 'bakolori_soils_classification.geojson',
    featureCount: 34,
    areaKm2: 230.0,
    uploadedAt: '2026-11-01 09:40',
    uploadedBy: 'Pedology Unit (SRRBDA)',
    previewFeatures: [
      {
        name: 'Class S1 Highly Suitable Alluvial Loam',
        type: 'Polygon',
        coordinatesSummary: '12.55°N, 6.01°E (88 km²)',
      },
      {
        name: 'Class S2 Moderately Suitable Clayey Silt',
        type: 'Polygon',
        coordinatesSummary: '12.51°N, 5.96°E (112 km²)',
      },
    ],
  },
];

export interface BlisLayerUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLayerSaved: (layer: UploadedMapLayer) => void;
}

export function BlisLayerUploadModal({ isOpen, onClose, onLayerSaved }: BlisLayerUploadModalProps) {
  // Step 1: upload/choose, Step 2: preview map/geometry, Step 3: saved
  const [step, setStep] = React.useState<'form' | 'preview'>('form');

  const [layerName, setLayerName] = React.useState('');
  const [layerType, setLayerType] = React.useState<UploadedMapLayer['layerType']>('canal_network');
  const [basinName, setBasinName] = React.useState<string>("Hadejia-Jama'are River Basin");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [fileFormat, setFileFormat] = React.useState<'geojson' | 'shapefile'>('geojson');
  const [details, setDetails] = React.useState('');

  const [isProcessing, setIsProcessing] = React.useState(false);
  const [previewStats, setPreviewStats] = React.useState<{
    featureCount: number;
    areaKm2: number;
    sampleFeatures: Array<{ name: string; type: string; coordinatesSummary: string }>;
  } | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);

      if (file.name.endsWith('.zip')) {
        setFileFormat('shapefile');
      } else {
        setFileFormat('geojson');
      }

      if (!layerName) {
        // Auto-populate layer name from filename
        const baseName = file.name
          .replace(/\.(geojson|json|zip)$/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        setLayerName(baseName);
      }
    }
  };

  const handleProceedToPreview = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    setTimeout(() => {
      setIsProcessing(false);
      setPreviewStats({
        featureCount: fileFormat === 'shapefile' ? 24 : 16,
        areaKm2: fileFormat === 'shapefile' ? 145.2 : 62.8,
        sampleFeatures: [
          {
            name: `${layerName} - Segment North (Primary Vector)`,
            type: layerType === 'canal_network' ? 'LineString' : 'Polygon',
            coordinatesSummary: '11.682°N, 8.514°E',
          },
          {
            name: `${layerName} - Segment South (Secondary Lateral)`,
            type: layerType === 'canal_network' ? 'LineString' : 'Polygon',
            coordinatesSummary: '11.641°N, 8.490°E',
          },
          {
            name: `${layerName} - Hydraulic Control Node / Weir`,
            type: 'Point',
            coordinatesSummary: '11.660°N, 8.502°E',
          },
        ],
      });
      setStep('preview');
    }, 600);
  };

  const handleSaveLayer = () => {
    const newLayer: UploadedMapLayer = {
      id: `layer-${Date.now()}`,
      name: layerName,
      layerType,
      basinName,
      format: fileFormat,
      fileName:
        selectedFile?.name ||
        `${layerName.toLowerCase().replace(/\s+/g, '_')}.${fileFormat === 'shapefile' ? 'zip' : 'geojson'}`,
      featureCount: previewStats?.featureCount || 16,
      areaKm2: previewStats?.areaKm2 || 50.0,
      uploadedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      uploadedBy: 'Current Officer',
      previewFeatures: previewStats?.sampleFeatures || [],
    };

    onLayerSaved(newLayer);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                <UploadCloud className="h-3.5 w-3.5 text-teal-700" /> Vector Spatial Layer Ingest
              </span>
              <Badge className="bg-slate-100 text-slate-600 font-mono text-[10px]">
                {step === 'form' ? 'Step 1 of 2: Upload' : 'Step 2 of 2: Map Preview & Commit'}
              </Badge>
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-2">Upload GIS Vector Layer</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload a zipped Shapefile (.zip) or GeoJSON (.geojson), assign basin scope, and
              preview geometries before committing to the map.
            </p>
          </div>
        </div>

        {step === 'form' ? (
          <form onSubmit={handleProceedToPreview} className="p-6 space-y-4">
            {/* File Drag/Drop or Select */}
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-teal-400 transition-colors bg-slate-50/50">
              <UploadCloud className="w-10 h-10 text-teal-600 mx-auto mb-2" />
              <div className="text-xs font-bold text-slate-800">
                {selectedFile ? (
                  <span className="text-teal-700 font-mono">{selectedFile.name}</span>
                ) : (
                  'Choose Shapefile (Zipped .zip) or GeoJSON (.geojson, .json)'
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                WGS84 EPSG:4326 coordinates recommended. Max file size: 25MB.
              </p>

              <label className="inline-block mt-3">
                <input
                  type="file"
                  required
                  accept=".zip,.geojson,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <span className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-xs">
                  Browse Spatial File
                </span>
              </label>
            </div>

            {/* Layer Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Layer Display Name *
                </label>
                <Input
                  required
                  placeholder="e.g. KRIS Main Canal Alignment 2026"
                  value={layerName}
                  onChange={(e) => setLayerName(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Layer Classification *
                </label>
                <Select
                  value={layerType}
                  onValueChange={(val: UploadedMapLayer['layerType']) => setLayerType(val)}
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="canal_network">Canal Network & Branches</SelectItem>
                    <SelectItem value="catchment">Basin Catchment Sub-Boundary</SelectItem>
                    <SelectItem value="flood_zone">Flood Inundation & Recession Zone</SelectItem>
                    <SelectItem value="drainage">Drainage & Stream Order Network</SelectItem>
                    <SelectItem value="soil_suitability">Soil Suitability Polygon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Basin Drainage Area *
                </label>
                <Select value={basinName} onValueChange={setBasinName}>
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hadejia-Jama'are River Basin">
                      Hadejia-Jama'are River Basin
                    </SelectItem>
                    <SelectItem value="Sokoto-Rima River Basin">Sokoto-Rima River Basin</SelectItem>
                    <SelectItem value="Upper Niger River Basin">Upper Niger River Basin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Input Format</label>
                <div className="flex items-center gap-2 pt-1.5">
                  <Badge
                    className={`cursor-pointer ${
                      fileFormat === 'geojson'
                        ? 'bg-teal-100 text-teal-800 border-teal-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                    onClick={() => setFileFormat('geojson')}
                  >
                    GeoJSON
                  </Badge>
                  <Badge
                    className={`cursor-pointer ${
                      fileFormat === 'shapefile'
                        ? 'bg-teal-100 text-teal-800 border-teal-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                    onClick={() => setFileFormat('shapefile')}
                  >
                    Zipped Shapefile (.shp/.shx/.dbf/.prj)
                  </Badge>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Layer Description & Source Notes
              </label>
              <textarea
                rows={2}
                placeholder="Optional survey date, sensor resolution, or survey organization..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="min-h-[44px] text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedFile || !layerName || isProcessing}
                className="bg-teal-700 hover:bg-teal-800 text-white min-h-[44px] text-xs gap-1.5 font-bold"
              >
                {isProcessing ? 'Validating Geometry...' : 'Preview on GIS Map'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-4">
            {/* Visual Vector Preview Sandbox */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-900 text-white relative h-64 p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                  <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30 text-xs">
                    Vector Geometry Validated
                  </Badge>
                  <span className="text-xs text-slate-400 font-mono">
                    {previewStats?.featureCount} Geometries Detected
                  </span>
                </div>
                <Badge className="bg-slate-800 text-slate-300 font-mono text-[11px]">
                  Approx. {previewStats?.areaKm2} km²
                </Badge>
              </div>

              {/* Simulated Vector Canvas Drawing */}
              <svg
                className="absolute inset-0 w-full h-full opacity-70 pointer-events-none"
                viewBox="0 0 600 240"
              >
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#334155" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="600" height="240" fill="url(#grid)" />

                {/* Polygonal or LineString vector layer preview */}
                {layerType === 'canal_network' ? (
                  <>
                    <path
                      d="M 60 180 Q 180 80 320 120 T 540 60"
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="3.5"
                      strokeDasharray="4 2"
                    />
                    <path
                      d="M 180 130 Q 240 170 380 190"
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="2.5"
                    />
                    <circle
                      cx="180"
                      cy="130"
                      r="4.5"
                      fill="#38bdf8"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx="320"
                      cy="120"
                      r="4.5"
                      fill="#38bdf8"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  </>
                ) : (
                  <>
                    <polygon
                      points="120,40 240,60 380,30 460,110 390,190 220,180 140,110"
                      fill="#0d9488"
                      fillOpacity="0.3"
                      stroke="#14b8a6"
                      strokeWidth="2"
                    />
                    <circle
                      cx="300"
                      cy="110"
                      r="4"
                      fill="#5eead4"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  </>
                )}
              </svg>

              <div className="z-10 flex items-center justify-between text-xs text-slate-300 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                <span>
                  Projection: <strong>WGS 84 / Geographic</strong>
                </span>
                <span>
                  Spatial Bounding Box: <strong>[11.60°N, 8.45°E to 11.75°N, 8.60°E]</strong>
                </span>
              </div>
            </div>

            {/* Extracted Sample Attributes */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                <span>
                  Extracted Vector Feature Attributes ({previewStats?.sampleFeatures.length} sample
                  records)
                </span>
                <span className="text-[11px] text-teal-700 font-normal">Layer: {layerName}</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                    <tr>
                      <th className="p-2.5">Feature Name</th>
                      <th className="p-2.5">Geometry</th>
                      <th className="p-2.5">Coordinates / Extent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewStats?.sampleFeatures.map((f, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2.5 font-semibold text-slate-900">{f.name}</td>
                        <td className="p-2.5">
                          <Badge className="bg-teal-50 text-teal-800 border-teal-200 text-[10px]">
                            {f.type}
                          </Badge>
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-slate-500">
                          {f.coordinatesSummary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Final Confirmation Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('form')}
                className="min-h-[44px] text-xs"
              >
                Back to Edit
              </Button>
              <Button
                type="button"
                onClick={handleSaveLayer}
                className="bg-teal-700 hover:bg-teal-800 text-white min-h-[44px] text-xs font-bold gap-1.5 shadow-md"
              >
                <CheckCircle2 className="w-4 h-4" />
                Commit & Activate Layer in GIS Workspace
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
