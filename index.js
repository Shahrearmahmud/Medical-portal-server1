const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const mg = require("nodemailer-mailgun-transport");
// var nodemailer = require('nodemailer');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000;

//warning:
//This is not the proper way to query
// After learning more about mongodb. use aggregate lookup,pipeline,match ,group


app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u0vva.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri,
   { useNewUrlParser: true, 
    useUnifiedTopology: true,
     serverApi: ServerApiVersion.v1 
    });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
      if (err) {
        return res.status(403).send({ message: 'Forbidden access' })
      }
      req.decoded = decoded;
      next();
    });
  }

  const auth = {
    auth: {
      api_key: process.env.EMAIL_SENDER_KEY
      // domain: "sandboxc02eaee99c484454a1b101598cac61a5.mailgun.org",
    },
  };
  // var nodemailerMailgun = nodemailer.createTransport(mg(auth));
  // const emailClient = nodemailer.createTransport(mg(auth));

function sendAppointmentEmail(booking) {
  const { patient, patientName, treatment, date, slot } = booking;

  var email = {
    from: "aodriteosrk10252@gmail.com",
    to: patient,
    subject: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
    text: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
    html: `
      <div>
        <p> Hello ${patientName}, </p>
        <h3>Your Appointment for ${treatment} is confirmed</h3>
        <p>Looking forward to seeing you on ${date} at ${slot}.</p>

        <h3>Our Address</h3>
        <p>Andor Killa Bandorban</p>
        <p>Bangladesh</p>
        <a href="https://web.programming-hero.com/">unsubscribe</a>
      </div>
    `,
  };

  emailClient.sendMail(email, (err, info) => {
    if (err) {
      console.log(err);
    } else {
      console.log(info);
    }
  });
}


async function run() {
    try {
        await client.connect();
        const serviceCollection = client
        .db('doctors_portal')
        .collection('services');
        const bookingCollection = client
        .db('doctors_portal')
        .collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');

        const verifyAdmin = async(req,res,next)=>{
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ 
              email: requester });
            if (requesterAccount.role === 'admin') {
                next();
        }
        else{
            res.status(403).send({message: 'forbidden'});
        }

    };

    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    });

        // app.get('/booking', verifyJWT, async (req, res) => {
        //     const patient = req.query.patient;
        //     const decodedEmail = req.decoded.email;
        //     if (patient === decodedEmail) {
        //         const query = { patient: patient };
        //         const bookings = await bookingCollection.find(query).toArray();
        //         return res.send(bookings);
        //     }
        //     else {
        //         return res.status(403).send({ message: 'forbidden access' });
        //     }
        // });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });


        app.get('/admin/:email', async(req,res)=>{
            const email = req.params.email;
            const user = await userCollection.findOne({email:email});
            const isAdmin = user.role ==='admin';
            res.send ({admin: isAdmin})
        });

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            
            const filter = { email: email };
            const updateDoc = {
              $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
          })
      
      
      

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign
            ({ email: email }, process.env.ACCESS_TOKEN_SECRET, 
              { expiresIn: '1h' })
            res.send({ result, token });
        });

        // app.get('/service', async (req, res) => {
        //     const query = {};
        //     const cursor = serviceCollection.find(query).project({name:1});
        //     const services = await cursor.toArray();
        //     res.send(services);
        // });

        app.get('/available', async (req, res) => {
            const date = req.query.date || 'july 11,2022';

            // step 1: get all services 
            const services = await serviceCollection.find().toArray();

            // step 2: get the booking of the day 
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();
            // step 3: for each service, find bookings for that service 
            services.forEach(service => {

                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                const bookedSlots = serviceBookings.map(book => book.slot);
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));

                service.slots = available;

            });


            res.send(services);
        });

        /**
         * Api Naming Convention
         * app.get('/booking') //get all this booking is this collection. or get more than  one or by filter
         * app.get('/booking/:id') // get a specific booking 
         * app.post('/booking') // add a new booking 
         * app.patch('/booking/:id')//patch specific one
         * app.put('/booking/:id')// upsert ==> update(if exists) or insert (if doesn't exist )
         * app.delete('/booking/:id')//delete specific one
         * 
         */

         app.get("/booking", verifyJWT, async (req, res) => {
          const patient = req.query.patient;
          const decodedEmail = req.decoded.email;
          if (patient === decodedEmail) {
            const query = { patient: patient };
            const bookings = await bookingCollection.find(query).toArray();
            return res.send(bookings);
          } else {
            return res.status(403).send({ message: "forbidden access" });
          }
        });
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = {
               treatment: booking.treatment,
                date: booking.date,
                 patient: booking.patient,
                 };
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists });
            }
            const result = await bookingCollection.insertOne(booking);
            console.log("sending email");
            sendAppointmentEmail(booking);
            return res.send({ success: true, result });
        });
        app.get('/doctor',verifyJWT,verifyAdmin,async(req,res)=>{
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        })

        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
          });
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter ={email:email};
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
          });


    }
    finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello from doctor ');
});
app.get('/email', (req, res) => {
    res.send('Hello from doctor ');
});

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`);
});