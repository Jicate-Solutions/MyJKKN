import { NextRequest } from 'next/server';

export interface IPAddressInfo {
  public_ip: string | null;
  private_ip?: string | null;
  proxy_chain?: string[];
  geo_info?: {
    country?: string;
    region?: string;
    city?: string;
  };
  detection_method: string;
}

/**
 * Enhanced IP address detection utility
 */
export class IPDetector {
  /**
   * Extract comprehensive IP information from request headers
   */
  static extractIPInfo(request: NextRequest): IPAddressInfo {
    const result: IPAddressInfo = {
      public_ip: null,
      detection_method: 'unknown'
    };

    // Try different header sources for IP address
    const headers = {
      'x-forwarded-for': request.headers.get('x-forwarded-for'),
      'x-real-ip': request.headers.get('x-real-ip'),
      'x-client-ip': request.headers.get('x-client-ip'),
      'cf-connecting-ip': request.headers.get('cf-connecting-ip'), // Cloudflare
      'x-vercel-forwarded-for': request.headers.get('x-vercel-forwarded-for'), // Vercel
      'x-forwarded': request.headers.get('x-forwarded'),
      'forwarded-for': request.headers.get('forwarded-for'),
      forwarded: request.headers.get('forwarded')
    };

    // Priority order for IP detection
    if (headers['cf-connecting-ip']) {
      result.public_ip = headers['cf-connecting-ip'];
      result.detection_method = 'cloudflare';
    } else if (headers['x-vercel-forwarded-for']) {
      result.public_ip = headers['x-vercel-forwarded-for'];
      result.detection_method = 'vercel';
    } else if (headers['x-real-ip']) {
      result.public_ip = headers['x-real-ip'];
      result.detection_method = 'x-real-ip';
    } else if (headers['x-forwarded-for']) {
      // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2)
      const forwardedIPs = headers['x-forwarded-for']
        .split(',')
        .map((ip) => ip.trim());
      result.public_ip = forwardedIPs[0]; // First IP is usually the original client
      result.proxy_chain = forwardedIPs.slice(1); // Remaining are proxies
      result.detection_method = 'x-forwarded-for';
    } else if (headers['x-client-ip']) {
      result.public_ip = headers['x-client-ip'];
      result.detection_method = 'x-client-ip';
    }

    // Fallback to remote address if available (usually not useful in serverless)
    if (!result.public_ip) {
      const url = new URL(request.url);
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        result.detection_method = 'fallback';
      }
    }

    // Clean up the IP address
    if (result.public_ip) {
      result.public_ip = this.cleanIPAddress(result.public_ip);
    }

    return result;
  }

  /**
   * Clean and validate IP address
   */
  private static cleanIPAddress(ip: string): string {
    // Remove port if present
    ip = ip.split(':')[0];

    // Remove any extra whitespace
    ip = ip.trim();

    return ip;
  }

  /**
   * Check if IP address is private/local
   */
  static isPrivateIP(ip: string): boolean {
    if (!ip) return false;

    const ipParts = ip.split('.').map(Number);
    if (ipParts.length !== 4 || ipParts.some(isNaN)) return false;

    // Private IP ranges:
    // 10.0.0.0 - 10.255.255.255 (10.0.0.0/8)
    // 172.16.0.0 - 172.31.255.255 (172.16.0.0/12)
    // 192.168.0.0 - 192.168.255.255 (192.168.0.0/16)
    // 127.0.0.0 - 127.255.255.255 (127.0.0.0/8) - localhost

    const [a, b, c, d] = ipParts;

    return (
      a === 10 || // 10.x.x.x
      a === 127 || // 127.x.x.x (localhost)
      (a === 172 && b >= 16 && b <= 31) || // 172.16.x.x - 172.31.x.x
      (a === 192 && b === 168) // 192.168.x.x
    );
  }

  /**
   * Get IP address type description
   */
  static getIPType(ip: string): string {
    if (!ip) return 'unknown';

    if (this.isPrivateIP(ip)) {
      if (ip.startsWith('127.')) return 'localhost';
      if (ip.startsWith('10.')) return 'private-class-a';
      if (ip.startsWith('172.')) return 'private-class-b';
      if (ip.startsWith('192.168.')) return 'private-class-c';
      return 'private';
    }

    return 'public';
  }

  /**
   * Format IP information for logging
   */
  static formatIPInfo(ipInfo: IPAddressInfo): Record<string, any> {
    const formatted: Record<string, any> = {
      public_ip: ipInfo.public_ip,
      detection_method: ipInfo.detection_method
    };

    if (ipInfo.public_ip) {
      formatted.ip_type = this.getIPType(ipInfo.public_ip);
      formatted.is_private = this.isPrivateIP(ipInfo.public_ip);
    }

    if (ipInfo.proxy_chain && ipInfo.proxy_chain.length > 0) {
      formatted.proxy_chain = ipInfo.proxy_chain;
    }

    if (ipInfo.private_ip) {
      formatted.private_ip = ipInfo.private_ip;
    }

    if (ipInfo.geo_info) {
      formatted.geo_info = ipInfo.geo_info;
    }

    return formatted;
  }
}
