import * as nodemailer from 'nodemailer';

export const createTransporter = () => {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, 
    auth: {
      user: "saeedbarcha77@gmail.com",
      pass: "eqvsvqrnkqmnezng",
    },
    tls: {
      rejectUnauthorized: false, 
    },
  });
};
