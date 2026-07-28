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

const FIRST_NAMES = [
  "Nina",
  "Jordan",
  "Morgan",
  "Casey",
  "Riley",
  "Avery",
  "Quinn",
  "Harper",
  "Reese",
  "Skyler",
  "Cameron",
  "Drew",
  "Jamie",
  "Taylor",
  "Alexis",
];

const LAST_NAMES = [
  "Patel",
  "Lee",
  "Chen",
  "Brooks",
  "Santos",
  "Nguyen",
  "Garcia",
  "Kim",
  "Walsh",
  "Torres",
  "Singh",
  "Okafor",
  "Murphy",
  "Ali",
  "Bennett",
];

const ICU_SKILLS = [
  ["Critical Care", "Ventilator"],
  ["Critical Care"],
  ["Critical Care", "Oncology"],
  ["Cardiac", "Critical Care"],
  ["Ventilator", "ECMO"],
];

const ER_SKILLS = [
  ["Trauma", "Triage"],
  ["Triage"],
  ["Trauma", "Pediatrics"],
  ["Emergency", "Triage"],
  ["Trauma"],
];

const PREFS = [["Day"], ["Evening"], ["Night"], ["Day", "Evening"], ["Evening", "Night"]];

const buildNurseDefs = (unitId: string, unitCode: "icu" | "er", count: number) => {
  const skillsPool = unitCode === "icu" ? ICU_SKILLS : ER_SKILLS;
  const startNum = unitCode === "icu" ? 1 : 101;

  return Array.from({ length: count }, (_, i) => {
    const n = startNum + i;
    return {
      email: `nurse${n}@hospital.local`,
      name: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`,
      unitId,
      skills: skillsPool[i % skillsPool.length],
      preferredShifts: PREFS[i % PREFS.length],
      licenseNumber: `RN-${String(n).padStart(4, "0")}`,
    };
  });
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
    ...buildNurseDefs(icu.id, "icu", 15),
    ...buildNurseDefs(er.id, "er", 15),
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
  console.log(`  ICU nurses: nurse1@hospital.local … nurse15@hospital.local`);
  console.log(`  ER nurses:  nurse101@hospital.local … nurse115@hospital.local`);
  console.log(`  Totals:     15 ICU + 15 ER`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
