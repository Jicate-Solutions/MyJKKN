/**
 * Converts a Base64 Data URL string to a File object.
 * @param dataurl The Data URL string.
 * @param filename The desired filename for the output File object.
 * @returns A File object.
 */
export function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',');
  if (arr.length < 2) {
    throw new Error('Invalid Data URL');
  }

  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch || mimeMatch.length < 2) {
    throw new Error('Could not determine MIME type from Data URL');
  }
  const mime = mimeMatch[1];

  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new File([u8arr], filename, { type: mime });
}
