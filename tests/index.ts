import Gen from '../src'

const doc = await Gen.validateData<_template>('template', {
    name: "Garry Fox",
    age: 50,
    verified: false,
    email: "garry.fox@email.com",
    address: {
        street_number: 1600,
        street_name: "Pennsylvania Ave NW",
        city: "Washington DC",
        province: null,
        country: "USA"
    },
    hobbies: ["Pickle ball"],
    location: [38.8977, -77.0365],
    other_details: {
        "employer": "US Govt.",
        "weight": "150lb",
        "height": "6.2ft"
    }
})

console.log(doc)