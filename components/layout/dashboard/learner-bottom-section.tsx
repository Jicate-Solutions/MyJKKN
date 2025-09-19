'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronLeft, ChevronRight, Bell, BookOpen, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function LearnerBottomSection() {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear] = useState(new Date().getFullYear());

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const today = new Date().getDate();

  const studentData = [
    {
      name: "Glenn Maxwell",
      score: "80/100",
      submitted: "15/10/20-10 PM",
      status: "Excellent",
      statusColor: "bg-green-100 text-green-700",
      avatar: "GM"
    },
    {
      name: "Cathie Heaven",
      score: "70/100",
      submitted: "12/10/20-10 PM",
      status: "Average",
      statusColor: "bg-yellow-100 text-yellow-700",
      avatar: "CH"
    },
    {
      name: "Vendor Gill",
      score: "85/100",
      submitted: "10/10/20-10 PM",
      status: "Poor",
      statusColor: "bg-red-100 text-red-700",
      avatar: "VG"
    },
    {
      name: "Prachi Shing",
      score: "60/100",
      submitted: "12/10/20-10 PM",
      status: "Excellent",
      statusColor: "bg-green-100 text-green-700",
      avatar: "PS"
    }
  ];

  const notices = [
    {
      title: "Notice of Special Examinations at Semester Spring 2021",
      author: "Jordan George",
      date: "19 JAN 2024",
      type: "examination",
      icon: BookOpen
    },
    {
      title: "Time Extension Notice of Semester Admission",
      author: "Rachel Valdez",
      date: "18 JAN 2024",
      type: "admission",
      icon: Calendar
    },
    {
      title: "COVID-19 Vaccination Survey October 2021",
      author: "Jacob Grant",
      date: "17 JAN 2024",
      type: "survey",
      icon: Bell
    },
    {
      title: "Scholarship Viva Notice Spring 2021",
      author: "Sarah Johnson",
      date: "16 JAN 2024",
      type: "scholarship",
      icon: Clock
    }
  ];

  const renderCalendarDays = () => {
    const days = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Add day headers
    daysOfWeek.forEach((day, index) => {
      days.push(
        <div key={`header-${index}`} className="text-center text-xs font-medium text-gray-500 py-2">
          {day}
        </div>
      );
    });

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-8" />);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === today && currentMonth === new Date().getMonth();
      const isSelected = day === 11; // Highlight 11th day as shown in image

      days.push(
        <button
          key={day}
          className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
            isToday
              ? 'bg-blue-500 text-white'
              : isSelected
              ? 'bg-purple-500 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-gray-900">Database</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Sort by</span>
                <Badge variant="outline" className="text-purple-600 border-purple-200">
                  Yearly
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 text-sm font-medium text-gray-600 border-b pb-2">
                <div className="col-span-3">Student name</div>
                <div className="col-span-2">Score</div>
                <div className="col-span-3">Submitted</div>
                <div className="col-span-2">Teacher</div>
                <div className="col-span-2">Student</div>
              </div>

              {/* Table Rows */}
              {studentData.map((student, index) => (
                <motion.div
                  key={student.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="grid grid-cols-12 gap-4 items-center py-3 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="col-span-3 flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-blue-100 text-blue-700 text-xs">
                        {student.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-gray-900">{student.name}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm font-semibold text-gray-900">{student.score}</span>
                  </div>
                  <div className="col-span-3">
                    <span className="text-sm text-gray-600">{student.submitted}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm text-gray-600">Excellent</span>
                  </div>
                  <div className="col-span-2">
                    <Badge className={`text-xs ${student.statusColor}`}>
                      Pass
                    </Badge>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
    </motion.div>
  );
}