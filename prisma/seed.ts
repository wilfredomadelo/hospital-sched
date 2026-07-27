import bcrypt from "bcryptjs";
import {
  LeaveStatus,
  LeaveType,
  Role,
  ShiftStatus,
  PrismaClient,
} from "@prisma/client";
import { addDays, setHours, setMinutes, startOfWeek } from "date-fns";

const prisma = new PrismaClient();

const combineDateAndTime = (date: Date, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return setMinutes(setHours(date, h), m);
};

async function main() {
  await prisma.complianceAlert.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.shiftAssignment.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.publicHoliday.deleteMany();
  await prisma.nurseProfile.deleteMany();
  await prisma.shiftTemplate.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@hospital.local",
      name: "Alex Admin",
      role: Role.ADMIN,
      passwordHash,
    },
  });

  const supervisor = await prisma.user.create({
    data: {
      email: "supervisor@hospital.local",
      name: "Sam Supervisor",
      role: Role.SUPERVISOR,
      passwordHash,
    },
  });

  const icu = await prisma.unit.create({
    data: {
      name: "ICU",
      description: "Intensive Care Unit",
    },
  });

  const er = await prisma.unit.create({
    data: {
      name: "ER",
      description: "Emergency Room",
    },
  });

  const day = await prisma.shiftTemplate.create({
    data: {
      name: "Day",
      startTime: "07:00",
      endTime: "15:00",
      isNight: false,
    },
  });

  const evening = await prisma.shiftTemplate.create({
    data: {
      name: "Evening",
      startTime: "15:00",
      endTime: "23:00",
      isNight: false,
    },
  });

  const night = await prisma.shiftTemplate.create({
    data: {
      name: "Night",
      startTime: "23:00",
      endTime: "07:00",
      isNight: true,
    },
  });

  const nurseDefs = [
    {
      email: "nurse1@hospital.local",
      name: "Nina Patel",
      unitId: icu.id,
      skills: ["Critical Care", "Ventilator"],
      preferredShifts: ["Day"],
      licenseNumber: "RN-1001",
    },
    {
      email: "nurse2@hospital.local",
      name: "Jordan Lee",
      unitId: icu.id,
      skills: ["Critical Care"],
      preferredShifts: ["Evening", "Night"],
      licenseNumber: "RN-1002",
    },
    {
      email: "nurse3@hospital.local",
      name: "Morgan Chen",
      unitId: er.id,
      skills: ["Trauma", "Triage"],
      preferredShifts: ["Day", "Evening"],
      licenseNumber: "RN-1003",
    },
    {
      email: "nurse4@hospital.local",
      name: "Casey Brooks",
      unitId: er.id,
      skills: ["Triage"],
      preferredShifts: ["Night"],
      licenseNumber: "RN-1004",
    },
    {
      email: "nurse5@hospital.local",
      name: "Riley Santos",
      unitId: icu.id,
      skills: ["Critical Care", "Oncology"],
      preferredShifts: ["Day"],
      licenseNumber: "RN-1005",
    },
  ];

  const nurses = [];
  for (const def of nurseDefs) {
    const user = await prisma.user.create({
      data: {
        email: def.email,
        name: def.name,
        role: Role.NURSE,
        passwordHash,
        nurseProfile: {
          create: {
            licenseNumber: def.licenseNumber,
            licenseExpiresAt: addDays(new Date(), 365),
            skills: JSON.stringify(def.skills),
            preferredShifts: JSON.stringify(def.preferredShifts),
            unitId: def.unitId,
            maxHoursPerWeek: 40,
          },
        },
      },
      include: { nurseProfile: true },
    });
    nurses.push(user);
  }

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  await prisma.publicHoliday.create({
    data: {
      date: setMinutes(setHours(addDays(weekStart, 6), 12), 0),
      name: "Hospital Foundation Day",
    },
  });

  const templates = [day, evening, night];

  for (let d = 0; d < 5; d++) {
    const dayDate = addDays(weekStart, d);
    const nurse = nurses[d % nurses.length];
    const profile = nurse.nurseProfile!;
    const template = templates[d % templates.length];
    let startAt = combineDateAndTime(dayDate, template.startTime);
    let endAt = combineDateAndTime(dayDate, template.endTime);
    if (template.isNight) {
      endAt = combineDateAndTime(addDays(dayDate, 1), template.endTime);
    }

    await prisma.shiftAssignment.create({
      data: {
        nurseId: profile.id,
        unitId: profile.unitId!,
        templateId: template.id,
        startAt,
        endAt,
        status: ShiftStatus.PUBLISHED,
      },
    });
  }

  await prisma.leaveRequest.create({
    data: {
      nurseId: nurses[0].nurseProfile!.id,
      startDate: addDays(weekStart, 10),
      endDate: addDays(weekStart, 12),
      type: LeaveType.VACATION,
      status: LeaveStatus.PENDING,
      reason: "Family trip",
    },
  });

  await prisma.notification.create({
    data: {
      userId: nurses[0].id,
      title: "Welcome",
      body: "Your schedule for this week has been published.",
    },
  });

  console.log("Seed complete.");
  console.log("Logins (password: password123):");
  console.log(`  Admin:      ${admin.email}`);
  console.log(`  Supervisor: ${supervisor.email}`);
  console.log(`  Nurses:     nurse1@hospital.local … nurse5@hospital.local`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
