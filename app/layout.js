import { Geist, Geist_Mono, Nunito } from "next/font/google";
import "./globals.css";
import Navbar from "./Components/Navbar";

  
const nun = Nunito({
  style: ['normal', 'italic'],
  subsets: ['latin'], 
});

export const metadata = {
  title: "CityZen",
  description: "Fostering change, snap by snap",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${nun.className}`}
      >
        <Navbar />
        {children}
      </body>
    </html>
  );
}
