// lib/services/student/student-service.ts
// Student service stub - referenced by admission-service.ts

export class StudentService {
  static async getStudentByLearnerId(learnerId: string): Promise<unknown> {
    console.warn('[student-service] getStudentByLearnerId stub called');
    return null;
  }

  static async linkLeadToStudent(leadId: string, studentId: string): Promise<void> {
    console.warn('[student-service] linkLeadToStudent stub called');
  }

  static async createStudentFromAdmission(
    admissionId: string,
    institutionId: string,
    studentData: Record<string, any>
  ): Promise<any> {
    console.warn('[student-service] createStudentFromAdmission stub called');
    throw new Error('Student service not yet implemented');
  }
}
