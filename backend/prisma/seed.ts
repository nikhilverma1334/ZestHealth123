import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const specialtyMappings = [
    { keyword: 'fever', specialty: 'General Physician' },
    { keyword: 'cold', specialty: 'General Physician' },
    { keyword: 'cough', specialty: 'General Physician' },
    { keyword: 'headache', specialty: 'Neurologist' },
    { keyword: 'stomach ache', specialty: 'Gastroenterologist' },
    { keyword: 'toothache', specialty: 'Dentist' },
    { keyword: 'chest pain', specialty: 'Cardiologist' },
    { keyword: 'skin rash', specialty: 'Dermatologist' },
    { keyword: 'acne', specialty: 'Dermatologist' },
    { keyword: 'hair loss', specialty: 'Dermatologist' },
    { keyword: 'joint pain', specialty: 'Orthopedist' },
    { keyword: 'back pain', specialty: 'Orthopedist' },
    { keyword: 'fracture', specialty: 'Orthopedist' },
    { keyword: 'vision', specialty: 'Ophthalmologist' },
    { keyword: 'eye pain', specialty: 'Ophthalmologist' },
    { keyword: 'ear pain', specialty: 'ENT Specialist' },
    { keyword: 'hearing', specialty: 'ENT Specialist' },
    { keyword: 'pregnancy', specialty: 'Gynecologist' },
    { keyword: 'periods', specialty: 'Gynecologist' },
    { keyword: 'diabetes', specialty: 'Endocrinologist' },
    { keyword: 'thyroid', specialty: 'Endocrinologist' },
    { keyword: 'child fever', specialty: 'Pediatrician' },
    { keyword: 'vaccination', specialty: 'Pediatrician' },
    { keyword: 'depression', specialty: 'Psychiatrist' },
    { keyword: 'anxiety', specialty: 'Psychiatrist' },
    { keyword: 'cancer', specialty: 'Oncologist' },
    { keyword: 'tumor', specialty: 'Oncologist' },
    { keyword: 'kidney stone', specialty: 'Urologist' },
    { keyword: 'urine infection', specialty: 'Urologist' },
    { keyword: 'asthma', specialty: 'Pulmonologist' },
    { keyword: 'breathing', specialty: 'Pulmonologist' },
    { keyword: 'surgery', specialty: 'General Surgeon' },
    { keyword: 'blood pressure', specialty: 'Cardiologist' },
    { keyword: 'allergy', specialty: 'Allergist' },
    { keyword: 'weight loss', specialty: 'Dietitian' },
    { keyword: 'diet', specialty: 'Dietitian' },
    // Expand to 50+ as needed
  ];

  for (const map of specialtyMappings) {
    await prisma.specialtyMap.upsert({
      where: { keyword: map.keyword },
      update: {},
      create: { keyword: map.keyword, specialty: map.specialty },
    });
  }
  console.log('SpecialtyMap seeded successfully');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
