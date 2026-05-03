// Type definitions para remover @ts-ignore e aumentar a segurança

declare var AFRAME: any;
declare var THREE: any;

interface Window {
    updateLogs?: () => void;
    clearLogs?: () => void;
}

// Service Worker globals (sw.js)
declare var workbox: any;
declare function importScripts(...urls: string[]): void;

interface GabineteConfig {
    version?: string;
    settings: {
        kioskTimeoutMs?: number;
        env: { sky: string; exposure: number; };
        labels?: { text: string; galleryA: string; galleryB: string; video: string; };
    };
    objects: Array<GabineteObject>;
}

interface GabineteObject {
    id: string;
    name_key?: string;
    type?: string;
    model?: string;
    src?: string;
    action?: string;
    part_name?: string;
    anim_target?: string;
    anim_to?: string;
    position?: string;
    rotation?: string;
    color?: string;
    radius?: string | number;
    width?: string | number;
    height?: string | number;
    depth?: string | number;
    isInteractive?: boolean;
    scale?: string;
    visible?: boolean | string;
    timing?: PanelTiming;
    panel?: UIPanelConfig;
    children?: Array<GabineteChild>;
}

interface GabineteChild {
    id?: string;
    part_name: string; // nome do node no GLTF
    role: 'animation' | 'collider' | 'static';
    // Para animação
    anim_axis?: 'x' | 'y' | 'z';
    anim_start?: number;
    anim_end?: number;
    // Para collider
    position?: string;
    rotation?: string;
    scale?: string;
}

interface PanelTiming {
    doorDur: number; 
    fadeDur: number; 
    waitOpen: number; 
    waitClose: number;
}

interface UIPanelConfig {
    title_key: string;
    description_key?: string;
    start_scale?: number;
    anchor_y_offset?: number;
    anchor_offset?: string;
    blend_y_ratio?: number;
    easing_open?: string;
    easing_close?: string;
    video?: { src: string };
    galleries?: Array<{ id: string; images: string[] }>;
    _timing?: PanelTiming; // Propriedade injetada em runtime
}

// Manifest de Hashes (Sync Engine)
interface ManifestEntry {
    sha256: string;
    size: number;
    modified: string;
    storage?: 'local' | 'supabase' | 'github';
    variant?: 'low' | 'high';
    pair?: string;
}

interface Manifest {
    version: number;
    timestamp: string;
    device_id: string;
    files: Record<string, ManifestEntry>;
}

// Image Pipeline (Conversão Client-Side)
interface PipelineConfig {
    highQuality: number;
    lowQuality: number;
    lowMaxDim: number;
    maxUploadBytes: number;
}

interface ImageVariant {
    blob: Blob;
    sha256: string;
    width: number;
    height: number;
    size: number;
    variant: 'high' | 'low';
}

interface PipelineResult {
    success: boolean;
    high?: ImageVariant;
    low?: ImageVariant;
    error?: string;
    stats?: {
        original: number;
        high: number;
        low: number;
        savings: string;
    };
}

// Sync Engine
type SyncStatus = 'synced' | 'pending' | 'offline' | 'syncing' | 'error';

interface SyncOperation {
    action: 'push' | 'pull' | 'delete';
    path: string;
    target: 'github' | 'supabase';
    sha256?: string;
    timestamp: number;
    retries: number;
}

interface SyncResult {
    success: boolean;
    pushed: number;
    pulled: number;
    conflicts: number;
    errors: number;
    errorDetails: string[];
}
