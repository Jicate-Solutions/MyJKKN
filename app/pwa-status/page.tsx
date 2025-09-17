'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Smartphone,
  Wifi,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Globe,
  Settings,
  Info
} from 'lucide-react';
import { usePWA } from '@/components/pwa/pwa-provider';
import Link from 'next/link';

export default function PWAStatusPage() {
  const {
    isInstalled,
    canInstall,
    updateAvailable,
    isOnline,
    isHydrated,
    installApp,
    updateApp,
    checkForUpdates
  } = usePWA();

  const [manifestData, setManifestData] = useState<any>(null);
  const [swRegistration, setSWRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<any>({});

  useEffect(() => {
    // Only run after hydration to avoid SSR mismatches
    if (!isHydrated) return;

    // Load manifest data
    fetch('/manifest.json')
      .then(response => response.json())
      .then(data => setManifestData(data))
      .catch(error => {});

    // Get service worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(registration => setSWRegistration(registration))
        .catch(error => {});
    }

    // Get device info
    setDeviceInfo({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screen: {
        width: screen.width,
        height: screen.height,
        pixelRatio: window.devicePixelRatio
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    });
  }, [isHydrated]);

  const getStatusIcon = (condition: boolean) => {
    // Show neutral icon during SSR/before hydration
    if (!isHydrated) {
      return <AlertCircle className="h-5 w-5 text-gray-400" />;
    }

    return condition ? (
      <CheckCircle className="h-5 w-5 text-green-500" />
    ) : (
      <XCircle className="h-5 w-5 text-red-500" />
    );
  };

  const getStatusBadge = (condition: boolean, trueText: string, falseText: string) => {
    // Show loading state during SSR/before hydration
    if (!isHydrated) {
      return (
        <Badge variant="outline">
          Loading...
        </Badge>
      );
    }

    return (
      <Badge variant={condition ? "default" : "secondary"}>
        {condition ? trueText : falseText}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">MyJKKN PWA Status</h1>
        <p className="text-muted-foreground">
          Progressive Web App implementation status and diagnostics
        </p>
      </div>

      {/* PWA Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            PWA Status Overview
          </CardTitle>
          <CardDescription>
            Current status of Progressive Web App features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                {getStatusIcon(isInstalled)}
                <span className="text-sm font-medium">Installed</span>
              </div>
              {getStatusBadge(isInstalled, "Yes", "No")}
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                {getStatusIcon(canInstall)}
                <span className="text-sm font-medium">Installable</span>
              </div>
              {getStatusBadge(canInstall, "Yes", "No")}
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                {getStatusIcon(isOnline)}
                <span className="text-sm font-medium">Online</span>
              </div>
              {getStatusBadge(isOnline, "Yes", "Offline")}
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className={`h-5 w-5 ${!isHydrated ? 'text-gray-400' : updateAvailable ? 'text-orange-500' : 'text-green-500'}`} />
                <span className="text-sm font-medium">Updates</span>
              </div>
              {getStatusBadge(updateAvailable, "Available", "Current")}
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            {isHydrated && canInstall && (
              <Button onClick={installApp} className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Install App
              </Button>
            )}

            {isHydrated && updateAvailable && (
              <Button onClick={updateApp} variant="outline" className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Update Now
              </Button>
            )}

            {isHydrated && (
              <Button onClick={checkForUpdates} variant="outline" className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Check Updates
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Manifest Information */}
      {isHydrated && manifestData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Web App Manifest
            </CardTitle>
            <CardDescription>
              Configuration details from manifest.json
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Name:</strong> {manifestData.name}
              </div>
              <div>
                <strong>Short Name:</strong> {manifestData.short_name}
              </div>
              <div>
                <strong>Display Mode:</strong> {manifestData.display}
              </div>
              <div>
                <strong>Theme Color:</strong> {manifestData.theme_color}
              </div>
              <div>
                <strong>Background Color:</strong> {manifestData.background_color}
              </div>
              <div>
                <strong>Start URL:</strong> {manifestData.start_url}
              </div>
              <div>
                <strong>Scope:</strong> {manifestData.scope}
              </div>
              <div>
                <strong>Icons:</strong> {manifestData.icons?.length || 0} defined
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Service Worker Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Service Worker
          </CardTitle>
          <CardDescription>
            Service worker registration and status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {getStatusIcon(isHydrated && 'serviceWorker' in navigator)}
              <span><strong>Support:</strong> {!isHydrated ? 'Checking...' : ('serviceWorker' in navigator ? 'Available' : 'Not supported')}</span>
            </div>

            {isHydrated && swRegistration && (
              <>
                <div>
                  <strong>Scope:</strong> {swRegistration.scope}
                </div>
                <div>
                  <strong>Active:</strong> {swRegistration.active ? 'Yes' : 'No'}
                </div>
                <div>
                  <strong>Installing:</strong> {swRegistration.installing ? 'Yes' : 'No'}
                </div>
                <div>
                  <strong>Waiting:</strong> {swRegistration.waiting ? 'Yes' : 'No'}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Device Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Device Information
          </CardTitle>
          <CardDescription>
            Device and browser capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Platform:</strong> {!isHydrated ? 'Loading...' : deviceInfo.platform}
            </div>
            <div>
              <strong>Language:</strong> {!isHydrated ? 'Loading...' : deviceInfo.language}
            </div>
            <div>
              <strong>Screen:</strong> {!isHydrated ? 'Loading...' : `${deviceInfo.screen?.width}×${deviceInfo.screen?.height}`}
            </div>
            <div>
              <strong>Viewport:</strong> {!isHydrated ? 'Loading...' : `${deviceInfo.viewport?.width}×${deviceInfo.viewport?.height}`}
            </div>
            <div>
              <strong>Pixel Ratio:</strong> {!isHydrated ? 'Loading...' : deviceInfo.screen?.pixelRatio}
            </div>
            <div>
              <strong>Cookies:</strong> {!isHydrated ? 'Loading...' : (deviceInfo.cookieEnabled ? 'Enabled' : 'Disabled')}
            </div>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer font-medium">User Agent</summary>
            <p className="mt-2 text-xs text-muted-foreground break-all">
              {!isHydrated ? 'Loading...' : deviceInfo.userAgent}
            </p>
          </details>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Test PWA functionality and navigate
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link href="/offline">
              <Button variant="outline" className="w-full">
                <Wifi className="mr-2 h-4 w-4" />
                Offline Page
              </Button>
            </Link>

            <Link href="/">
              <Button variant="outline" className="w-full">
                <Smartphone className="mr-2 h-4 w-4" />
                Main App
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}