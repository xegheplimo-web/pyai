'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issue
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface Place {
  id: number | string;
  name: string;
  fullAddress: string;
  lat: number;
  lon: number;
  type?: string;
  category?: string;
  phone?: string | null;
  website?: string | null;
  openingHours?: string | null;
}

interface MapProps {
  places: Place[];
  center?: [number, number];
  zoom?: number;
  selectedPlace?: Place | null;
  onPlaceSelect?: (place: Place) => void;
}

export default function MapComponent({ places, center, zoom = 13, selectedPlace, onPlaceSelect }: MapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const defaultCenter: [number, number] = center || [10.8231, 106.6297]; // Ho Chi Minh City
    const map = L.map(mapContainerRef.current).setView(defaultCenter, zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update markers when places change
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;
    
    markersRef.current.clearLayers();

    const highlightedIcon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="width:32px;height:32px;border-radius:50%;background:#f97316;border:3px solid #fff;box-shadow:0 2px 8px rgba(249,115,22,0.5);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:14px;">★</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    });

    places.forEach((place) => {
      if (place.lat && place.lon) {
        const isSelected = selectedPlace && selectedPlace.id === place.id;
        const marker = L.marker(
          [place.lat, place.lon],
          isSelected ? { icon: highlightedIcon } : {}
        );

        const popupContent = `
          <div style="min-width:200px;font-family:sans-serif;">
            <h3 style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1e293b;">${place.name}</h3>
            <p style="margin:0 0 4px;font-size:11px;color:#64748b;">${place.fullAddress?.split(',').slice(0, 3).join(',') || ''}</p>
            ${place.phone ? `<p style="margin:0 0 2px;font-size:11px;">📞 ${place.phone}</p>` : ''}
            ${place.openingHours ? `<p style="margin:0 0 2px;font-size:11px;">🕐 ${place.openingHours}</p>` : ''}
            ${place.website ? `<a href="${place.website}" target="_blank" style="font-size:11px;color:#3b82f6;">🌐 Website</a>` : ''}
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.on('click', () => {
          if (onPlaceSelect) onPlaceSelect(place);
        });
        markersRef.current!.addLayer(marker);
      }
    });

    // Fit map to show all markers
    if (places.length > 0 && places.some(p => p.lat && p.lon)) {
      const validPlaces = places.filter(p => p.lat && p.lon);
      if (validPlaces.length === 1) {
        mapRef.current.setView([validPlaces[0].lat, validPlaces[0].lon], 16);
      } else {
        const bounds = L.latLngBounds(validPlaces.map(p => [p.lat, p.lon] as [number, number]));
        mapRef.current.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  }, [places, selectedPlace, onPlaceSelect]);

  // Center on selected place
  useEffect(() => {
    if (!mapRef.current || !selectedPlace?.lat || !selectedPlace?.lon) return;
    mapRef.current.setView([selectedPlace.lat, selectedPlace.lon], 17);
  }, [selectedPlace]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full rounded-xl overflow-hidden"
      style={{ minHeight: '300px' }}
    />
  );
}
