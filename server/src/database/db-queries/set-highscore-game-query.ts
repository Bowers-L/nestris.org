import { encodeDecimal } from "../db-misc";
import { WriteDBQuery } from "../db-query";


export class SetHighscoreGameQuery extends WriteDBQuery {
    public override query = `
        INSERT INTO highscore_games (userid, game_id)
        VALUES ($1, $2)
        ON CONFLICT (userid) 
        DO UPDATE SET game_id = EXCLUDED.game_id;
    `;

    public override warningMs = null;

    constructor(userid: string, gameID: string) {
        super([userid, gameID]);
    }
}