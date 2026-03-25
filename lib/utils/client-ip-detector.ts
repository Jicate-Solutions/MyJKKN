/**
 * Client-side IP detection utilities
 * This runs in the browser to get additional IP information
 */

export interface ClientIPInfo {
  local_ips: string[];
  public_ip?: string;
  detection_method: string;
  error?: string;
}

export class ClientIPDetector {
  /**
   * Get local IP addresses using WebRTC
   * This can detect the user's actual local network IP
   */
  static async getLocalIPs(): Promise<string[]> {
    return new Promise((resolve) => {
      const ips: string[] = [];
      const rtc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      rtc.createDataChannel('');
      rtc.createOffer().then((offer) => rtc.setLocalDescription(offer));

      rtc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          const ipMatch = candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch && !ips.includes(ipMatch[1])) {
            ips.push(ipMatch[1]);
          }
        }
      };

      // Give it some time to gather candidates
      setTimeout(() => {
        rtc.close();
        resolve(ips);
      }, 1000);
    });
  }

  /**
   * Get public IP address from external service
   */
  static async getPublicIP(): Promise<string | null> {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip || null;
    } catch (error) {
      console.error('Failed to get public IP:', error);
      return null;
    }
  }

  /**
   * Get comprehensive client IP information
   */
  static async getClientIPInfo(): Promise<ClientIPInfo> {
    const result: ClientIPInfo = {
      local_ips: [],
      detection_method: 'webrtc+api'
    };

    try {
      // Get local IPs via WebRTC
      const localIPs = await this.getLocalIPs();
      result.local_ips = localIPs;

      // Get public IP via external API
      const publicIP = await this.getPublicIP();
      if (publicIP) {
        result.public_ip = publicIP;
      }

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.detection_method = 'failed';
      return result;
    }
  }

  /**
   * Send client IP information to activity logging API
   */
  static async logClientIPInfo(activityId?: string): Promise<void> {
    try {
      const clientIPInfo = await this.getClientIPInfo();

      // Send to API endpoint for logging
      await fetch('/api/activity/client-ip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_ip_info: clientIPInfo,
          activity_id: activityId,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Failed to log client IP info:', error);
      // Don't throw - this is optional enhancement
    }
  }

  /**
   * Detect if user is using VPN/Proxy
   * Simple heuristic based on IP discrepancies
   */
  static detectVPNProxy(serverIP: string, clientPublicIP: string): boolean {
    if (!serverIP || !clientPublicIP) return false;
    return serverIP !== clientPublicIP;
  }
}
