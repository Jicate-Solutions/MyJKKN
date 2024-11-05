// lib/utils/debug-logger.ts

export const debugLog = (context: string, data: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.group(`Debug: ${context}`);
    console.log(JSON.stringify(data, null, 2));
    console.groupEnd();
  }
};

export const logError = (context: string, error: any) => {
  console.error(`Error in ${context}:`, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code
  });
};
