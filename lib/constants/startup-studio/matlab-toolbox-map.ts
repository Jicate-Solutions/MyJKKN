// MATLAB Toolbox Mapping for Startup Studio
// Maps workflow types to recommended MATLAB toolboxes and Onramp courses

export const BUILD_TOOL_OPTIONS = [
  { value: 'lovable', label: 'Lovable' },
  { value: 'matlab', label: 'MATLAB' },
  { value: 'code', label: 'Code (Custom)' },
  { value: 'other', label: 'Other' },
] as const;

export type BuildTool = (typeof BUILD_TOOL_OPTIONS)[number]['value'];

export interface MatlabToolboxMapping {
  workflowType: string;
  toolboxes: string[];
  onrampCourse: string;
  onrampUrl: string;
}

export const MATLAB_TOOLBOX_MAP: MatlabToolboxMapping[] = [
  {
    workflowType: 'data_analysis',
    toolboxes: ['Statistics and Machine Learning Toolbox', 'Database Toolbox'],
    onrampCourse: 'MATLAB Onramp',
    onrampUrl: 'https://matlabacademy.mathworks.com/details/matlab-onramp/gettingstarted',
  },
  {
    workflowType: 'image_processing',
    toolboxes: ['Image Processing Toolbox', 'Computer Vision Toolbox'],
    onrampCourse: 'Image Processing Onramp',
    onrampUrl: 'https://matlabacademy.mathworks.com/details/image-processing-onramp/imageprocessing',
  },
  {
    workflowType: 'signal_processing',
    toolboxes: ['Signal Processing Toolbox', 'DSP System Toolbox'],
    onrampCourse: 'Signal Processing Onramp',
    onrampUrl: 'https://matlabacademy.mathworks.com/details/signal-processing-onramp/signalprocessing',
  },
  {
    workflowType: 'machine_learning',
    toolboxes: ['Statistics and Machine Learning Toolbox', 'Deep Learning Toolbox'],
    onrampCourse: 'Machine Learning Onramp',
    onrampUrl: 'https://matlabacademy.mathworks.com/details/machine-learning-onramp/machinelearning',
  },
  {
    workflowType: 'deep_learning',
    toolboxes: ['Deep Learning Toolbox', 'Parallel Computing Toolbox'],
    onrampCourse: 'Deep Learning Onramp',
    onrampUrl: 'https://matlabacademy.mathworks.com/details/deep-learning-onramp/deeplearning',
  },
  {
    workflowType: 'control_systems',
    toolboxes: ['Control System Toolbox', 'Simulink'],
    onrampCourse: 'Simulink Onramp',
    onrampUrl: 'https://matlabacademy.mathworks.com/details/simulink-onramp/simulink',
  },
  {
    workflowType: 'optimization',
    toolboxes: ['Optimization Toolbox', 'Global Optimization Toolbox'],
    onrampCourse: 'Optimization Onramp',
    onrampUrl: 'https://matlabacademy.mathworks.com/details/optimization-onramp/optim',
  },
  {
    workflowType: 'simulation',
    toolboxes: ['Simulink', 'SimBiology'],
    onrampCourse: 'Simulink Onramp',
    onrampUrl: 'https://matlabacademy.mathworks.com/details/simulink-onramp/simulink',
  },
  {
    workflowType: 'bioinformatics',
    toolboxes: ['Bioinformatics Toolbox', 'SimBiology'],
    onrampCourse: 'MATLAB Onramp',
    onrampUrl: 'https://matlabacademy.mathworks.com/details/matlab-onramp/gettingstarted',
  },
  {
    workflowType: 'app_development',
    toolboxes: ['MATLAB Compiler', 'MATLAB Web App Server'],
    onrampCourse: 'App Building Onramp',
    onrampUrl: 'https://matlabacademy.mathworks.com/details/app-building-onramp/omlappdesigner',
  },
];

// Flat list of all MATLAB toolboxes for multi-select UI
export const MATLAB_TOOLBOXES = [
  'Bioinformatics Toolbox',
  'Computer Vision Toolbox',
  'Control System Toolbox',
  'Curve Fitting Toolbox',
  'Database Toolbox',
  'Deep Learning Toolbox',
  'DSP System Toolbox',
  'Global Optimization Toolbox',
  'Image Processing Toolbox',
  'MATLAB Compiler',
  'MATLAB Web App Server',
  'Optimization Toolbox',
  'Parallel Computing Toolbox',
  'Signal Processing Toolbox',
  'SimBiology',
  'Simulink',
  'Statistics and Machine Learning Toolbox',
  'Symbolic Math Toolbox',
] as const;

export const DEPLOYMENT_PLATFORM_OPTIONS = [
  { value: 'matlab_web_app_server', label: 'MATLAB Web App Server' },
  { value: 'vercel', label: 'Vercel' },
  { value: 'railway', label: 'Railway' },
  { value: 'lovable', label: 'Lovable' },
  { value: 'supabase', label: 'Supabase' },
  { value: 'other', label: 'Other' },
] as const;

export const EXTERNAL_PLATFORM_OPTIONS = [
  { value: 'matlab_academy', label: 'MATLAB Academy' },
  { value: 'coursera', label: 'Coursera' },
  { value: 'nptel', label: 'NPTEL' },
  { value: 'internal', label: 'Internal' },
  { value: 'other', label: 'Other' },
] as const;
