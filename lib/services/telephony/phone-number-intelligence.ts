/**
 * Indian mobile number prefix -> telecom circle (state/region) mapping.
 * Source: TRAI numbering plan. First 4 digits after +91 indicate the circle.
 * This gives us location even for missed calls where we have ZERO other data.
 */
export class PhoneNumberIntelligence {
  // Major series -> circle mapping (covers ~80% of Indian mobile numbers)
  private static readonly CIRCLE_MAP: Record<string, string> = {
    // Tamil Nadu
    '9443': 'Tamil Nadu', '9444': 'Chennai', '9445': 'Tamil Nadu',
    '9489': 'Tamil Nadu', '9486': 'Tamil Nadu', '9487': 'Tamil Nadu',
    '9488': 'Tamil Nadu', '9442': 'Tamil Nadu', '9498': 'Tamil Nadu',
    '8428': 'Tamil Nadu', '8489': 'Tamil Nadu', '8438': 'Tamil Nadu',
    '8508': 'Tamil Nadu', '8525': 'Tamil Nadu', '8526': 'Tamil Nadu',
    '7339': 'Tamil Nadu', '7358': 'Tamil Nadu', '7373': 'Tamil Nadu',
    '7397': 'Tamil Nadu', '7402': 'Tamil Nadu', '7418': 'Tamil Nadu',
    '6369': 'Tamil Nadu', '6374': 'Tamil Nadu', '6379': 'Tamil Nadu',
    '6380': 'Tamil Nadu', '6381': 'Tamil Nadu', '6382': 'Tamil Nadu',
    '6383': 'Tamil Nadu', '6384': 'Tamil Nadu', '6385': 'Tamil Nadu',

    // Chennai specifically
    '9840': 'Chennai', '9841': 'Chennai', '9884': 'Chennai',
    '7200': 'Chennai', '7299': 'Chennai', '7305': 'Chennai',
    '8056': 'Chennai', '8144': 'Chennai',

    // Karnataka
    '9900': 'Karnataka', '9901': 'Karnataka', '9902': 'Karnataka',
    '9844': 'Karnataka', '9845': 'Karnataka', '9880': 'Karnataka',
    '9886': 'Karnataka', '9980': 'Karnataka', '9964': 'Karnataka',
    '7760': 'Karnataka', '7795': 'Karnataka', '7829': 'Karnataka',
    '8050': 'Karnataka', '8147': 'Karnataka', '8277': 'Karnataka',
    '6360': 'Karnataka', '6361': 'Karnataka', '6362': 'Karnataka',

    // Kerala
    '9446': 'Kerala', '9447': 'Kerala', '9495': 'Kerala',
    '9496': 'Kerala', '9497': 'Kerala', '9961': 'Kerala',
    '8075': 'Kerala', '8078': 'Kerala', '8086': 'Kerala',
    '8089': 'Kerala', '8129': 'Kerala', '8136': 'Kerala',
    '7012': 'Kerala', '7025': 'Kerala', '7034': 'Kerala',
    '6235': 'Kerala', '6238': 'Kerala', '6282': 'Kerala',

    // Andhra Pradesh / Telangana
    '9848': 'Andhra Pradesh', '9849': 'Andhra Pradesh',
    '9866': 'Andhra Pradesh', '9885': 'Andhra Pradesh',
    '9912': 'Andhra Pradesh', '9963': 'Andhra Pradesh',
    '7893': 'Andhra Pradesh', '7981': 'Andhra Pradesh',
    '8008': 'Andhra Pradesh', '8096': 'Andhra Pradesh',
    '6281': 'Andhra Pradesh', '6300': 'Andhra Pradesh',
    '9000': 'Telangana', '9010': 'Telangana', '9030': 'Telangana',
    '9100': 'Telangana', '9110': 'Telangana', '9121': 'Telangana',
    '7075': 'Telangana', '7095': 'Telangana',

    // Maharashtra
    '9820': 'Mumbai', '9821': 'Mumbai', '9867': 'Mumbai',
    '9869': 'Mumbai', '9892': 'Mumbai', '9920': 'Mumbai',
    '9930': 'Mumbai', '8080': 'Maharashtra', '8082': 'Maharashtra',
    '7276': 'Maharashtra', '7378': 'Maharashtra',
    '9890': 'Maharashtra', '9881': 'Maharashtra',

    // Delhi/NCR
    '9810': 'Delhi', '9811': 'Delhi', '9818': 'Delhi',
    '9868': 'Delhi', '9871': 'Delhi', '9873': 'Delhi',
    '9891': 'Delhi', '9899': 'Delhi', '9953': 'Delhi',
    '9958': 'Delhi', '7011': 'Delhi', '7042': 'Delhi',
    '8130': 'Delhi', '8178': 'Delhi', '8527': 'Delhi',

    // UP
    '9415': 'Uttar Pradesh', '9450': 'Uttar Pradesh',
    '9453': 'Uttar Pradesh', '9455': 'Uttar Pradesh',
    '9456': 'Uttar Pradesh', '9839': 'Uttar Pradesh',
    '7007': 'Uttar Pradesh', '7080': 'Uttar Pradesh',
    '8009': 'Uttar Pradesh', '8052': 'Uttar Pradesh',

    // Rajasthan
    '9413': 'Rajasthan', '9414': 'Rajasthan',
    '9460': 'Rajasthan', '9461': 'Rajasthan',
    '9828': 'Rajasthan', '9829': 'Rajasthan',
    '7014': 'Rajasthan', '7023': 'Rajasthan',
    '8003': 'Rajasthan', '8058': 'Rajasthan',

    // Gujarat
    '9426': 'Gujarat', '9427': 'Gujarat', '9428': 'Gujarat',
    '9429': 'Gujarat', '9825': 'Gujarat', '9879': 'Gujarat',
    '7043': 'Gujarat', '7069': 'Gujarat',
    '8128': 'Gujarat', '8141': 'Gujarat',

    // West Bengal
    '9432': 'West Bengal', '9433': 'West Bengal',
    '9434': 'West Bengal', '9830': 'West Bengal',
    '9831': 'West Bengal', '9836': 'West Bengal',
    '7003': 'West Bengal', '7044': 'West Bengal',
    '8013': 'West Bengal', '8100': 'West Bengal',

    // Punjab
    '9417': 'Punjab', '9463': 'Punjab', '9464': 'Punjab',
    '9465': 'Punjab', '9814': 'Punjab', '9815': 'Punjab',
    '9876': 'Punjab', '9877': 'Punjab',
    '7508': 'Punjab', '7527': 'Punjab',

    // Bihar / Jharkhand
    '9430': 'Bihar', '9431': 'Bihar', '9470': 'Bihar',
    '9472': 'Bihar', '9473': 'Bihar', '9835': 'Jharkhand',
    '9934': 'Bihar', '7004': 'Bihar', '7033': 'Bihar',

    // Madhya Pradesh
    '9425': 'Madhya Pradesh', '9424': 'Madhya Pradesh',
    '9826': 'Madhya Pradesh', '9827': 'Madhya Pradesh',
    '7024': 'Madhya Pradesh', '7049': 'Madhya Pradesh',

    // Odisha
    '9437': 'Odisha', '9438': 'Odisha', '9439': 'Odisha',
    '9853': 'Odisha', '9937': 'Odisha', '9938': 'Odisha',
    '7008': 'Odisha', '7064': 'Odisha',

    // Puducherry (important for JKKN - nearby)
    '9786': 'Puducherry',
    '8098': 'Puducherry', '7094': 'Puducherry',
  };

  /**
   * Extract state/region from Indian mobile number.
   * Works for ALL calls - missed or answered - no transcription needed.
   */
  static getLocationFromPhone(phoneNumber: string): string | null {
    if (!phoneNumber) return null;

    // Normalize: remove +91, 0, spaces, dashes
    const cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
    let digits = cleaned;
    if (digits.startsWith('+91')) digits = digits.slice(3);
    else if (digits.startsWith('91') && digits.length > 10) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);

    if (digits.length !== 10) return null;

    // Try 4-digit prefix first (more specific)
    const prefix4 = digits.substring(0, 4);
    if (this.CIRCLE_MAP[prefix4]) return this.CIRCLE_MAP[prefix4];

    // Landline numbers starting with specific area codes
    const LANDLINE_MAP: Record<string, string> = {
      '44': 'Chennai', '422': 'Coimbatore', '452': 'Madurai',
      '431': 'Trichy', '427': 'Salem', '424': 'Erode',
      '423': 'Namakkal', '4324': 'Karur', '4362': 'Thanjavur',
      '451': 'Dindigul', '416': 'Vellore', '421': 'Tirupur',
      '80': 'Bangalore', '40': 'Hyderabad', '484': 'Kochi',
      '471': 'Trivandrum', '11': 'Delhi', '22': 'Mumbai',
      '33': 'Kolkata', '79': 'Ahmedabad', '20': 'Pune',
    };

    for (const [code, city] of Object.entries(LANDLINE_MAP)) {
      if (digits.startsWith(code)) return city;
    }

    return null;
  }

  /**
   * Check if this is likely a Tamil Nadu number (JKKN's primary catchment).
   */
  static isTamilNaduNumber(phoneNumber: string): boolean {
    const location = this.getLocationFromPhone(phoneNumber);
    return location !== null && ['Tamil Nadu', 'Chennai', 'Puducherry'].includes(location);
  }

  /**
   * Get all intelligence we can extract from just a phone number.
   * No API calls, no transcription - pure number analysis.
   */
  static analyzePhoneNumber(phoneNumber: string): {
    location: string | null;
    isLocalCatchment: boolean;
    numberType: 'mobile' | 'landline' | 'unknown';
  } {
    const location = this.getLocationFromPhone(phoneNumber);
    const isLocal = this.isTamilNaduNumber(phoneNumber);

    const cleaned = phoneNumber.replace(/[\s\-\(\)+]/g, '');
    let digits = cleaned;
    if (digits.startsWith('91') && digits.length > 10) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);

    // Indian mobile numbers start with 6-9, landlines with 2-5
    const firstDigit = parseInt(digits[0]);
    const numberType = firstDigit >= 6 ? 'mobile' : firstDigit >= 2 ? 'landline' : 'unknown';

    return { location, isLocalCatchment: isLocal, numberType };
  }
}
