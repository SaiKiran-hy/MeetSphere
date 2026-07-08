import React, { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import HomeIcon from '@mui/icons-material/Home';

import { IconButton } from '@mui/material';
export default function History() {


    const { getHistoryOfUser } = useContext(AuthContext);

    const [meetings, setMeetings] = useState([])
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);


    const routeTo = useNavigate();

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setLoading(true);
                setError(null);
                const history = await getHistoryOfUser();
                // Defensive: if the backend ever returns something other
                // than a bare array (e.g. { meetings: [...] } or an error
                // object), calling .map on it would crash the render.
                // Normalizing here means a shape mismatch shows up as an
                // empty list + a logged warning instead of a blank/broken
                // page with no clue why.
                if (Array.isArray(history)) {
                    setMeetings(history);
                } else {
                    console.warn('[History] Unexpected response shape from getHistoryOfUser:', history);
                    setMeetings([]);
                }
            } catch (err) {
                // The original code swallowed this completely - silently
                // failing is exactly why history "just showed the path and
                // nothing else" with zero clues as to why. Logging it is
                // the fastest way to see whether this is a 401 (bad/missing
                // token), a 404 (wrong route), a CORS error, or something
                // else entirely.
                console.error('[History] Failed to fetch history:', err);
                console.error('[History] Response data:', err?.response?.data);
                console.error('[History] Status:', err?.response?.status);
                setError('Could not load your meeting history. Please try again.');
            } finally {
                setLoading(false);
            }
        }

        fetchHistory();
    }, [])

    let formatDate = (dateString) => {

        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0")
        const year = date.getFullYear();

        return `${day}/${month}/${year}`

    }

    return (
        <div>

            <IconButton onClick={() => {
                routeTo("/home")
            }}>
                <HomeIcon />
            </IconButton >

            {loading ? <p>Loading history...</p> : null}

            {error ? <p style={{ color: "red" }}>{error}</p> : null}

            {!loading && !error && meetings.length === 0 ? <p>No meeting history yet.</p> : null}

            {
                (!loading && meetings.length !== 0) ? meetings.map((e, i) => {
                    return (

                        <React.Fragment key={i}>


                            <Card variant="outlined">


                                <CardContent>
                                    <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
                                        Code: {e.meetingCode}
                                    </Typography>

                                    <Typography sx={{ mb: 1.5 }} color="text.secondary">
                                        Date: {formatDate(e.date)}
                                    </Typography>

                                </CardContent>


                            </Card>


                        </React.Fragment>
                    )
                }) : null

            }

        </div>
    )
}