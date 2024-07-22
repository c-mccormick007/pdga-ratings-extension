
import { Observable, BehaviorSubject } from 'rxjs';
import { shareReplay, mapTo, filter } from 'rxjs/operators';
import { Round, SavedRound } from '../vos/round.vo';
import { SAVED_ROUNDS_STORAGE_KEY } from '../shared/constants';
import { debugLog, generateUniqueId, debugLogError, getStandardDeviation } from '../shared/utils';
import { SimpleHash } from '../vos/simple-hash.vo';
import { storedDataGetter, storedDataSetter } from '../shared/storage-apis';
import { getIncludedRounds, getCurrentRating } from '../shared/ratings-detail-dom-manipulation';

class UserCreatedRounds {
    savedRounds: Observable<SimpleHash<SimpleHash<SavedRound>>>;
    private includedRounds: Round[];
    standardDeviation: number;
    currentRating: number;
    private savedRoundsSubject: BehaviorSubject<SimpleHash<SimpleHash<SavedRound>>>;

    constructor() {
        this.savedRoundsSubject = new BehaviorSubject(null);
        this.savedRounds = this.savedRoundsSubject.asObservable().pipe(
            filter(hash => hash !== null),
            shareReplay(1)
        );
        this.includedRounds = getIncludedRounds();
        this.standardDeviation = getStandardDeviation(this.includedRounds);
        this.currentRating = getCurrentRating();

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (changes[SAVED_ROUNDS_STORAGE_KEY]) {
                debugLog('Stored user info change: ', changes[SAVED_ROUNDS_STORAGE_KEY].newValue);
                this.savedRoundsSubject.next(changes[SAVED_ROUNDS_STORAGE_KEY].newValue)
            }
        });

        this.getStoredRounds().subscribe(rounds => {
            this.savedRoundsSubject.next(rounds);
        });
    }

    addRound(round: Round, pdgaNumber: string): Observable<SavedRound> {
        const id = generateUniqueId();
        const savedRounds = this.savedRoundsSubject.getValue();
        const playerRounds = Object.assign({}, savedRounds[pdgaNumber] || {});
        const roundRating = parseInt('' + round.roundRating);
        const dropped = this.currentRating - roundRating > 100 || this.currentRating - roundRating > (2.5*this.standardDeviation);
        const createdRound = <SavedRound>Object.assign({}, round, {
            id,
            pdgaNumber,
            dropped,
            roundRating: roundRating,
            roundNumber: parseInt('' + round.roundNumber),
            holes: parseInt('' + (round.holes || 18)),
        });
        // console.log(round, createdRound);
        // TODO: when ratings updated, re-calculate dropped rounds

        playerRounds[id] = createdRound;
        let updatedRounds = Object.assign({}, savedRounds, {
            [pdgaNumber]: playerRounds
        });
        return this.setStoredRounds(updatedRounds).pipe(
            mapTo(createdRound)
        );
    }

    removeRound(round: SavedRound): Observable<SavedRound> {
        let savedRounds = this.savedRoundsSubject.getValue();
        let updatedPlayerRounds = Object.assign({}, savedRounds[round.pdgaNumber] || {});
        delete updatedPlayerRounds[round.id];

        let updatedRounds = Object.assign({}, savedRounds, {
            [round.pdgaNumber]: updatedPlayerRounds
        });
        return this.setStoredRounds(updatedRounds).pipe(
            mapTo(round)
        );
    }

    updateRound(roundToUpdate: SavedRound, round: Round) {
        let savedRounds = this.savedRoundsSubject.getValue();
        let updatedPlayerRounds = Object.assign({}, savedRounds[roundToUpdate.pdgaNumber] || {});

        let newRoundRating = parseInt('' + round.roundRating);
        let dropped = this.currentRating - newRoundRating > 100 || this.currentRating - newRoundRating > (2.5*this.standardDeviation);

        let updatedRound = Object.assign({}, roundToUpdate, round, {
            dropped,
            roundRating: newRoundRating,
            holes: parseInt('' + (round.holes || 18)),
        });
        
        updatedPlayerRounds[roundToUpdate.id] = updatedRound;
        let updatedRounds = Object.assign({}, savedRounds, {
            [roundToUpdate.pdgaNumber]: updatedPlayerRounds
        });
        return this.setStoredRounds(updatedRounds).pipe(
            mapTo(updatedRound)
        );
    }

    clearPlayer(pdgaNumber: string) {
        let savedRounds = Object.assign({}, this.savedRoundsSubject.getValue());
        delete savedRounds[pdgaNumber] 
        return this.setStoredRounds(savedRounds).pipe(
            mapTo(savedRounds)
        );
    }

    private setStoredRounds = storedDataSetter<SimpleHash<SimpleHash<SavedRound>>>(SAVED_ROUNDS_STORAGE_KEY);
    private getStoredRounds = storedDataGetter<SimpleHash<SimpleHash<SavedRound>>>(SAVED_ROUNDS_STORAGE_KEY, {});

}

export const UserCreatedRoundsService = new UserCreatedRounds();
