import React, { useContext, useState } from "react";
import withAuth from "../utils/withAuth";
import { useNavigate } from "react-router-dom";
import "../App.css";

import {
  Button,
  TextField,
  Typography,
  Box,
  Stack,
} from "@mui/material";

import RestoreIcon from "@mui/icons-material/Restore";
import LogoutIcon from "@mui/icons-material/Logout";
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";

import { AuthContext } from "../contexts/AuthContext";

function HomeComponent() {
  const navigate = useNavigate();
  const [meetingCode, setMeetingCode] = useState("");
  const { addToUserHistory } = useContext(AuthContext);

  const handleJoinVideoCall = async () => {
    if (!meetingCode.trim()) return;
    await addToUserHistory(meetingCode);
    navigate(`/${meetingCode}`);
  };

  return (
    <Box sx={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Navbar ── */}
      <Box
        component="nav"
        className="navBar"
      >
        <div className="logoSection">
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "primary.main",
              color: "#fff",
              flexShrink: 0,
            }}
          >
            <VideocamRoundedIcon fontSize="small" />
          </Box>
          <h2>MeetSphere</h2>
        </div>

        <div className="navActions">
          <Button
            startIcon={<RestoreIcon />}
            onClick={() => navigate("/history")}
            className="historyBtn"
            sx={{
              color: "#374151",
              textTransform: "none",
              fontWeight: 500,
              borderRadius: "10px",
              "&:hover": { color: "#2563EB", bgcolor: "transparent" },
            }}
          >
            History
          </Button>
          <Button
            startIcon={<LogoutIcon />}
            onClick={() => {
              localStorage.removeItem("token");
              navigate("/auth");
            }}
            sx={{
              color: "#374151",
              textTransform: "none",
              fontWeight: 500,
              borderRadius: "10px",
              "&:hover": { color: "#2563EB", bgcolor: "transparent" },
            }}
          >
            Logout
          </Button>
        </div>
      </Box>

      {/* ── Main content ── */}
      <div className="meetContainer">

        {/* Left panel — hero + join card */}
        <div className="leftPanel">
          <div className="heroSection">

            <Typography className="heroTitle">
              Connect with
              <br />
              anyone,
              <br />
              anywhere.
            </Typography>

            <Typography className="heroSubtitle">
              Crystal-clear HD meetings with secure screen
              sharing and real-time collaboration.
            </Typography>

            <Box className="joinCard">
              <Typography className="joinTitle">
                Join a Meeting
              </Typography>

              <div className="joinBox">
                <TextField
                  fullWidth
                  placeholder="Enter Meeting Code"
                  variant="outlined"
                  value={meetingCode}
                  onChange={(e) => setMeetingCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinVideoCall()}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "14px",
                      backgroundColor: "#f9fafb",
                    },
                  }}
                />
                <Button
                  variant="contained"
                  onClick={handleJoinVideoCall}
                  sx={{
                    borderRadius: "14px",
                    textTransform: "none",
                    px: 4,
                    height: "56px",
                    fontWeight: 600,
                    fontSize: "16px",
                    flexShrink: 0,
                    boxShadow: "none",
                  }}
                >
                  Join
                </Button>
              </div>
            </Box>

          </div>
        </div>

        {/* Right panel — floating illustration */}
        <div className="rightPanel">
          <img
            src="/logo3.png"
            alt="Meeting Illustration"
          />
        </div>

      </div>
    </Box>
  );
}

export default withAuth(HomeComponent);